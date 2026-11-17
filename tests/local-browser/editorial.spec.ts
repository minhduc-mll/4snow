import { test, expect, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { canonicalJson, type ImportDocument } from "../../lib/vua-tieng-viet/dictionary-contract";

const endpoint = "http://127.0.0.1:54321/functions/v1/vtv-dictionary";
const runtime = Object.fromEntries(readFileSync("supabase/.temp/start-secrets/supabase_edge_runtime_4snow/env/docker.env", "utf8").split(/\r?\n/).filter((line) => line.includes("=")).map((line) => { const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1)]; }));
function rec(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
const filters = { sourceId: null, level: null, review: null, hasDefinition: null, collisionsOnly: false };
async function login(page: Page) {
  await page.goto("/admin#dictionary");
  const password = process.env.VTV_LOCAL_TEST_PASSWORD;
  if (!password) throw new Error("Local test password missing");
  await page.getByLabel(/Tài khoản|Username/i).fill("local-verification-admin");
  await page.getByLabel(/Mật khẩu|Password/i).fill(password);
  await page.getByRole("button", { name: /Đăng nhập|Sign in|Log in/i }).click();
  await expect(page.locator("#dictionary-preview-file")).toBeVisible();
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
async function checkApproval(page: Page) {
  await page.locator("#editorial-review").selectOption("approved");
  for (const label of [/tên riêng|proper name/i, /chữ viết tắt|abbreviation/i, /xúc phạm|offensive/i, /sai cấu trúc|malformed/i, /chưa kiểm chứng|unverified generated/i]) await page.getByLabel(label).check();
  await page.getByLabel(/độ thông dụng; đủ điều kiện|eligible as an answer/i).check();
  await page.locator("#editorial-rationale").fill("Synthetic local verification only.");
}

test("real editorial pagination, policy, lost-response retry, competing edits and cleanup", async ({ page, browser }) => {
  test.setTimeout(120000);
  await login(page);
  const doc: ImportDocument = JSON.parse(readFileSync("tests/vua-tieng-viet/fixtures/synthetic.json", "utf8"));
  const run = randomUUID();
  doc.artifactId = randomUUID();
  doc.artifactRevision = `editorial-${run}`;
  doc.sources[0].sourceId = randomUUID();
  doc.sources[0].resourceRevision = doc.artifactRevision;
  doc.sources[0].artifactSha256 = createHash("sha256").update(run).digest("hex");
  const template = doc.entries[0];
  const hostile = '<img src=x onerror="window.__vtvInjected=true">';
  doc.entries = Array.from({ length: 51 }, (_, index) => ({ ...template, sourceId: doc.sources[0].sourceId, externalId: `${run}-${index}`, sourceEntryId: `${run}-entry-${index}`, sourceSenseId: `sense-${index}`, original: index === 50 ? "meo" : "mèo", definitionVi: index === 50 ? null : `Nghĩa giả lập ${index}.`, sourceNotes: index === 0 ? hostile : "Synthetic only" }));
  const session = await call(page, "import-start", { artifactId: doc.artifactId, artifactRevision: doc.artifactRevision, chunkCount: 1 }, true);
  await call(page, "import-apply", { importId: session.importId, document: doc, canonicalHash: createHash("sha256").update(canonicalJson(doc)).digest("hex") }, true);
  await call(page, "import-finalize", { importId: session.importId, expectedDraftRevision: session.draftRevision }, true);
  let cursor: unknown = null;
  let target: Record<string, unknown> | undefined;
  for (let count = 0; count < 30 && !target; count++) {
    const listed = await call(page, "list", { filters, cursor, limit: 100 });
    if (!Array.isArray(listed.items)) throw new Error("Invalid list");
    target = listed.items.find((item: unknown): item is Record<string, unknown> => rec(item) && item.externalId === `${run}-0`);
    cursor = listed.nextCursor;
    if (!cursor) break;
  }
  if (!target || typeof target.id !== "string" || typeof target.sourceId !== "string") throw new Error("Synthetic candidate missing");
  const entryId = target.id;
  const applyFilters = async () => {
    const response = observed(page, "list");
    await page.getByRole("button", { name: /Áp dụng bộ lọc|Apply filters/i }).click();
    expect((await response).status()).toBe(200);
  };
  await page.getByLabel(/Mã nguồn|Source ID/i).fill(target.sourceId);
  await page.getByLabel(/Số chữ|Letter count/i).selectOption("3");
  await page.getByLabel(/Trạng thái duyệt|Review status/i).first().selectOption("pending");
  await applyFilters();
  await expect(page.locator("li").filter({ has: page.getByRole("button", { name: /mèo · 3|meo · 3/ }) })).toHaveCount(50);
  let response = observed(page, "list");
  await page.getByRole("button", { name: /Trang tiếp|Next page/i }).click();
  expect((await response).status()).toBe(200);
  await expect(page.locator("li").filter({ has: page.getByRole("button", { name: /mèo · 3|meo · 3/ }) })).toHaveCount(1);
  await page.getByRole("button", { name: /Trang đầu|First page/i }).click();
  await page.getByLabel(/Chỉ mục trùng cách viết|Only matching spellings/i).check();
  await page.getByLabel(/Nghĩa tiếng Việt|Vietnamese definition/i).first().selectOption("yes");
  await applyFilters();
  await expect(page.getByRole("button", { name: /^meo · 3/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^mèo · 3/ })).toHaveCount(50);
  await page.getByLabel(/Chỉ mục trùng cách viết|Only matching spellings/i).uncheck();
  await page.getByLabel(/Nghĩa tiếng Việt|Vietnamese definition/i).first().selectOption("no");
  await applyFilters();
  await expect(page.getByRole("button", { name: /^meo · 3/ })).toHaveCount(1);
  await page.getByLabel(/Nghĩa tiếng Việt|Vietnamese definition/i).first().selectOption("");
  await applyFilters();
  await page.locator("li").filter({ hasText: entryId }).getByRole("button").click();
  await expect(page.locator("#editorial-original")).toHaveValue("mèo");
  await expect(page.getByText(hostile, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, "__vtvInjected"))).toBeUndefined();
  await checkApproval(page);
  await page.locator("#editorial-definition").fill("");
  await page.getByRole("button", { name: /Lưu duyệt|Save review/i }).click();
  await expect(page.getByText(/Kiểm tra cách viết, điều kiện duyệt|Check the spelling, approval checks/i)).toBeVisible();
  await page.locator("#editorial-definition").fill("Nghĩa giả lập 0.");
  let lostKey: string | undefined;
  let committed: unknown;
  let recovered = false;
  await page.route(endpoint, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const body: unknown = route.request().postDataJSON();
    if (!rec(body) || body.operation !== "review") return route.continue();
    const backend = await route.fetch({ maxRetries: 0 });
    expect(backend.status()).toBe(200);
    const result: unknown = await backend.json();
    if (!rec(result) || !rec(result.data) || typeof body.idempotencyKey !== "string") throw new Error("Invalid review");
    if (!lostKey) { lostKey = body.idempotencyKey; committed = result.data; return route.abort("failed"); }
    expect(body.idempotencyKey).toBe(lostKey);
    expect(result.data).toEqual(committed);
    recovered = true;
    return route.fulfill({ response: backend });
  });
  await page.getByRole("button", { name: /Lưu duyệt|Save review/i }).click();
  await expect(page.getByRole("button", { name: /Thử lại an toàn|Retry safely/i })).toBeVisible();
  await page.getByRole("button", { name: /Thử lại an toàn|Retry safely/i }).click();
  await expect(page.getByText(/^#2 · mèo/)).toBeVisible();
  expect(recovered).toBe(true);
  await expect(page.locator("#editorial-review")).toHaveValue("approved");
  await page.unroute(endpoint);
  await page.locator("#editorial-original").fill("mêu");
  await page.locator("#editorial-definition").fill("Nghĩa đã chỉnh sửa.");
  response = observed(page, "review");
  await page.getByRole("button", { name: /Lưu duyệt|Save review/i }).click();
  expect((await response).status()).toBe(200);
  await expect(page.locator("#editorial-review")).toHaveValue("pending");
  await expect(page.getByLabel(/độ thông dụng; đủ điều kiện|eligible as an answer/i)).not.toBeChecked();
  await expect(page.getByRole("heading", { name: "mêu · MÊU" })).toBeVisible();
  await expect(page.getByText(/^#1 · mèo/)).toBeVisible();
  await expect(page.getByText(/^#3 · mêu/)).toBeVisible();

  const otherContext = await browser.newContext();
  try {
    const other = await otherContext.newPage();
    await login(other);
    await other.getByLabel(/Mã nguồn|Source ID/i).fill(target.sourceId);
    const listed = observed(other, "list");
    await other.getByRole("button", { name: /Áp dụng bộ lọc|Apply filters/i }).click();
    await listed;
    await other.locator("li").filter({ hasText: entryId }).getByRole("button").click();
    await expect(other.locator("#editorial-original")).toHaveValue("mêu");
    await checkApproval(page);
    await other.locator("#editorial-review").selectOption("rejected");
    await other.locator("#editorial-rationale").fill("Competing synthetic rejection.");
    let release: (() => void) | undefined;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const inputs: Record<string, unknown>[] = [];
    const statuses: number[] = [];
    const competing = async (route: Route) => {
      if (route.request().method() !== "POST") return route.continue();
      const body: unknown = route.request().postDataJSON();
      if (!rec(body) || body.operation !== "review" || !rec(body.input)) return route.continue();
      inputs.push(body);
      if (inputs.length === 2) release?.();
      await barrier;
      const backend = await route.fetch({ maxRetries: 0 });
      statuses.push(backend.status());
      return route.fulfill({ response: backend });
    };
    await page.route(endpoint, competing);
    await other.route(endpoint, competing);
    await Promise.all([page.getByRole("button", { name: /Lưu duyệt|Save review/i }).click(), other.getByRole("button", { name: /Lưu duyệt|Save review/i }).click()]);
    await expect.poll(() => statuses.length).toBe(2);
    expect([...statuses].sort()).toEqual([200, 409]);
    expect(inputs[0].idempotencyKey).not.toBe(inputs[1].idempotencyKey);
    const detail = await call(page, "detail", { entryId });
    if (!rec(detail.current)) throw new Error("Missing current revision");
    expect(detail.current.revisionNumber).toBe(4);
    await expect(page.getByText(/^#4 · mêu/)).toBeVisible();
    await expect(other.getByText(/^#4 · mêu/)).toBeVisible();
    expect(detail.sourceEntryId).toBe(`${run}-entry-0`);
    await page.unroute(endpoint);
    // A real invalid token must clear the private editor, not a mocked 401.
    await page.evaluate(() => localStorage.setItem("admin-auth-token", "invalid-verification-token"));
    await page.locator("#editorial-rationale").fill("Must not reach privileged mutation.");
    const denied = observed(page, "review");
    await page.getByRole("button", { name: /Lưu duyệt|Save review/i }).click();
    expect((await denied).status()).toBe(401);
    await expect(page.locator("#editorial-original")).toHaveCount(0);
    await expect(page.getByLabel(/Tài khoản|Username/i)).toBeVisible();
    await other.getByRole("button", { name: /Đăng xuất|Log out/i }).click();
    await expect(other.locator("#editorial-original")).toHaveCount(0);
  } finally { await otherContext.close(); }
});
