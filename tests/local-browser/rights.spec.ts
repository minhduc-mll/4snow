import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { canonicalJson, type ImportDocument } from "../../lib/vua-tieng-viet/dictionary-contract";

const endpoint = "http://127.0.0.1:54321/functions/v1/vtv-dictionary";
const runtime = Object.fromEntries(readFileSync("supabase/.temp/start-secrets/supabase_edge_runtime_4snow/env/docker.env", "utf8").split(/\r?\n/).filter((line) => line.includes("=")).map((line) => { const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1)]; }));
function rec(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
const filters = { sourceId: null, level: null, review: null, hasDefinition: null, collisionsOnly: false };
async function login(page: Page) {
  await page.goto("/admin#dictionary/review");
  const password = process.env.VTV_LOCAL_TEST_PASSWORD;
  if (!password) throw new Error("Local test password missing");
  await page.getByLabel(/Tài khoản|Username/i).fill("local-verification-admin");
  await page.getByLabel(/Mật khẩu|Password/i).fill(password);
  await page.getByRole("button", { name: /Đăng nhập|Sign in|Log in/i }).click();
  await expect(page.getByRole("navigation", { name: /Các bước quản lý từ điển|Dictionary workflow steps/i })).toBeVisible();
}
async function call(page: Page, operation: string, input: unknown, mutation = false) {
  const token = await page.evaluate(() => localStorage.getItem("admin-auth-token"));
  if (!token) throw new Error("Missing test session");
  const response = await page.request.post(endpoint, { headers: { apikey: runtime.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }, data: { operation, requestId: randomUUID(), input, ...(mutation ? { idempotencyKey: randomUUID() } : {}) } });
  expect(response.status()).toBe(200);
  const result: unknown = await response.json();
  if (!rec(result) || !rec(result.data)) throw new Error("Invalid trusted response");
  return result.data;
}
function observed(page: Page, operation: string) {
  return page.waitForResponse((response) => {
    if (response.url() !== endpoint || response.request().method() !== "POST") return false;
    const body: unknown = response.request().postDataJSON();
    return rec(body) && body.operation === operation;
  });
}

test("real source rights workflow records linked decisions and retries a committed response", async ({ page }) => {
  test.setTimeout(120000);
  await login(page);
  const doc: ImportDocument = JSON.parse(readFileSync("tests/vua-tieng-viet/fixtures/synthetic.json", "utf8"));
  const run = randomUUID();
  doc.artifactId = randomUUID(); doc.artifactRevision = run;
  doc.sources[0].sourceId = randomUUID(); doc.sources[0].resourceRevision = run;
  doc.sources[0].artifactSha256 = createHash("sha256").update(run).digest("hex");
  doc.entries = [{ ...doc.entries[0], sourceId: doc.sources[0].sourceId, externalId: run }];
  const session = await call(page, "import-start", { artifactId: doc.artifactId, artifactRevision: run, chunkCount: 1 }, true);
  await call(page, "import-apply", { importId: session.importId, document: doc, canonicalHash: createHash("sha256").update(canonicalJson(doc)).digest("hex") }, true);
  await call(page, "import-finalize", { importId: session.importId, expectedDraftRevision: session.draftRevision }, true);
  let entry: Record<string, unknown> | undefined;
  let cursor: unknown = null;
  for (let i = 0; i < 100; i++) {
    const result = await call(page, "list", { filters, cursor, limit: 100 });
    if (!Array.isArray(result.items)) throw new Error("Invalid list");
    entry = result.items.find((item: unknown): item is Record<string, unknown> => rec(item) && item.externalId === run);
    if (entry || !result.nextCursor) break;
    cursor = result.nextCursor;
  }
  if (!entry || typeof entry.id !== "string" || typeof entry.sourceId !== "string") throw new Error("Missing fixture");
  await page.getByLabel(/Mã nguồn|Source ID/i).fill(entry.sourceId);
  const response = observed(page, "list");
  await page.getByRole("button", { name: /Áp dụng bộ lọc|Apply filters/i }).click();
  expect((await response).status()).toBe(200);
  await page.getByRole("button", { name: /tiếng Việt · 9/i }).click();
  const panel = page.getByRole("region", { name: /Duyệt quyền nguồn|Source rights review/i });
  await expect(panel).toContainText(/đang chặn|blocked/i);
  let key: unknown;
  let receipt: unknown;
  let calls = 0;
  await page.route(endpoint, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const body: unknown = route.request().postDataJSON();
    if (!rec(body) || body.operation !== "rights-review") return route.continue();
    const actual = await route.fetch({ maxRetries: 0 });
    expect(actual.status()).toBe(200);
    const result: unknown = await actual.json();
    if (!rec(result)) throw new Error("Invalid receipt");
    calls++;
    if (calls === 1) { key = body.idempotencyKey; receipt = result.data; return route.abort(); }
    expect(body.idempotencyKey).toBe(key);
    expect(result.data).toEqual(receipt);
    return route.fulfill({ response: actual });
  });
  await page.locator("#rights-decision").selectOption("cleared");
  await page.locator("#rights-evidence").fill("SYNTHETIC private evidence only");
  await page.locator("#rights-obligations").fill("SYNTHETIC private obligations only");
  await page.getByRole("button", { name: /Lưu quyết định quyền|Save rights decision/i }).click();
  await panel.getByRole("button", { name: /Thử lại an toàn|Retry safely/i }).click();
  await expect(panel).toContainText(/Đã cho phép|Cleared/i);
  await expect.poll(() => calls).toBe(2);
  await page.unroute(endpoint);
  let detail = await call(page, "detail", { entryId: entry.id });
  if (!rec(detail.rightsReview) || !rec(detail.attributionPreview)) throw new Error("Missing rights");
  const firstId = detail.rightsReview.id;
  const allowed = ["id", "sourceName", "sourceEntryId", "sourceSenseId", "entryUrl", "artifactUrl", "artifactSha256", "resourceRevision", "artifactRevision", "licenseName", "licenseVersion", "licenseUrl", "attributionText", "historyUrl", "modificationsNotice"];
  expect(Object.keys(detail.attributionPreview).sort()).toEqual(allowed.sort());
  expect(JSON.stringify(detail.attributionPreview)).not.toContain("private evidence");
  await call(page, "rights-review", { sourceId: entry.sourceId, expectedDraftRevision: detail.draftRevision, decision: "rejected", evidence: "Synthetic revised decision", obligations: "Synthetic only" }, true);
  detail = await call(page, "detail", { entryId: entry.id });
  if (!rec(detail.rightsReview)) throw new Error("Missing revision");
  expect(detail.rightsReview.previousReviewId).toBe(firstId);
  expect(detail.rightsReview.decision).toBe("rejected");
  await page.getByRole("button", { name: /Đăng xuất|Log out/i }).click();
  await expect(panel).toHaveCount(0);
});
