import { test, expect, type Response } from "@playwright/test";
import { readFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import type { ImportDocument } from "../../lib/vua-tieng-viet/dictionary-contract";

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
async function data(response: Response): Promise<Record<string, unknown>> {
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  if (!record(body) || body.ok !== true || !record(body.data)) throw new Error("Invalid import response");
  return body.data;
}

test("real import recovers committed lost responses and resumes two chunks after reload", async ({ page }) => {
  test.setTimeout(120000);
  const fixture: ImportDocument = JSON.parse(readFileSync("tests/vua-tieng-viet/fixtures/synthetic.json", "utf8"));
  fixture.artifactId = randomUUID();
  fixture.artifactRevision = `browser-recovery-${randomUUID()}`;
  fixture.chunkCount = 2;
  fixture.sources[0].sourceId = randomUUID();
  fixture.sources[0].resourceRevision = fixture.artifactRevision;
  fixture.sources[0].artifactSha256 = createHash("sha256").update(fixture.artifactRevision).digest("hex");
  fixture.entries[0].sourceId = fixture.sources[0].sourceId;
  const chunks: ImportDocument[] = [fixture, { ...fixture, chunkIndex: 1, entries: [{ ...fixture.entries[0], externalId: "synthetic-2", sourceEntryId: "synthetic-entry-2", sourceSenseId: "synthetic-sense-2" }] }];
  const committed = new Map<string, { key: string; data: unknown }>();
  let applyLost = false;
  let finalizeLost = false;
  let replayed = 0;
  await page.route("http://127.0.0.1:54321/functions/v1/vtv-dictionary", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const body: unknown = route.request().postDataJSON();
    if (!record(body) || typeof body.operation !== "string") throw new Error("Invalid operation");
    const drop = (body.operation === "import-apply" && !applyLost) || (body.operation === "import-finalize" && !finalizeLost);
    if (drop || committed.has(body.operation)) {
      // Forward to real Supabase first. Only the browser delivery is faulted.
      const response = await route.fetch({ maxRetries: 0 });
      expect(response.status()).toBe(200);
      const result: unknown = await response.json();
      if (!record(result) || !record(result.data) || typeof body.idempotencyKey !== "string") throw new Error("Invalid mutation result");
      if (drop) {
        committed.set(body.operation, { key: body.idempotencyKey, data: result.data });
        if (body.operation === "import-apply") applyLost = true;
        else finalizeLost = true;
        return route.abort("failed");
      }
      const previous = committed.get(body.operation);
      if (!previous) throw new Error("Missing committed receipt");
      expect(body.idempotencyKey).toBe(previous.key);
      expect(result.data).toEqual(previous.data);
      committed.delete(body.operation);
      replayed++;
      return route.fulfill({ response });
    }
    return route.continue();
  });
  const responseFor = (operation: string) => page.waitForResponse((response) => {
    if (!response.url().endsWith("/functions/v1/vtv-dictionary") || response.request().method() !== "POST") return false;
    const body: unknown = response.request().postDataJSON();
    return record(body) && body.operation === operation;
  });
  const select = async (index: number) => {
    let pending = responseFor("import-preview");
    const file = { name: `synthetic-${index}.json`, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(chunks[index])) };
    await page.locator("#dictionary-preview-file").setInputFiles(file);
    let response = await pending;
    if (response.status() === 429) {
      const seconds = Number(response.headers()["retry-after"]);
      expect(seconds).toBeGreaterThan(0);
      expect(seconds).toBeLessThanOrEqual(60);
      let remaining = seconds * 1000 + 100;
      while (remaining > 0) { const interval = Math.min(remaining, 10000); await page.waitForTimeout(interval); remaining -= interval; }
      pending = responseFor("import-preview");
      await page.locator("#dictionary-preview-file").setInputFiles(file);
      response = await pending;
    }
    expect((await data(response)).valid).toBe(true);
  };
  await page.goto("/admin");
  await page.getByLabel(/Tài khoản|Username/i).fill("local-verification-admin");
  const password = process.env.VTV_LOCAL_TEST_PASSWORD;
  if (!password) throw new Error("Missing local test password");
  await page.getByLabel(/Mật khẩu|Password/i).fill(password);
  await page.getByRole("button", { name: /Đăng nhập|Sign in|Log in/i }).click();
  await select(0);
  let pending = responseFor("import-start");
  await page.getByRole("button", { name: /Bắt đầu hoặc tiếp tục|Start or resume/i }).click();
  const started = await data(await pending);
  await expect(page.getByText(/Tiến độ nhập: 0\/2|Import progress: 0\/2/i)).toBeVisible();
  await page.getByRole("button", { name: /Tải phần này lên|Upload this chunk/i }).click();
  await expect(page.getByRole("button", { name: /Thử lại an toàn|Retry safely/i })).toBeVisible();
  await page.getByRole("button", { name: /Thử lại an toàn|Retry safely/i }).click();
  await expect(page.getByText(/Tiến độ nhập: 1\/2|Import progress: 1\/2/i)).toBeVisible();
  await page.reload();
  await select(1);
  pending = responseFor("import-start");
  await page.getByRole("button", { name: /Bắt đầu hoặc tiếp tục|Start or resume/i }).click();
  const resumed = await data(await pending);
  expect(resumed.importId).toBe(started.importId);
  expect(Array.isArray(resumed.receipts) && resumed.receipts.length).toBe(1);
  await expect(page.getByText(/Tiến độ nhập: 1\/2|Import progress: 1\/2/i)).toBeVisible();
  await page.getByRole("button", { name: /Tải phần này lên|Upload this chunk/i }).click();
  await expect(page.getByText(/Tiến độ nhập: 2\/2|Import progress: 2\/2/i)).toBeVisible();
  await page.getByRole("button", { name: /Hoàn tất nhập|Finalize import/i }).click();
  await expect(page.getByRole("button", { name: /Thử lại an toàn|Retry safely/i })).toBeVisible();
  await page.getByRole("button", { name: /Thử lại an toàn|Retry safely/i }).click();
  await expect(page.getByText(/Đã hoàn tất, chờ duyệt|Finalized, awaiting review/i)).toBeVisible();
  await expect(page.getByText(/Mục mới: 2|New candidates: 2/i)).toBeVisible();
  expect(applyLost && finalizeLost).toBe(true);
  expect(replayed).toBe(2);
  await page.reload();
  await select(0);
  pending = responseFor("import-start");
  await page.getByRole("button", { name: /Bắt đầu hoặc tiếp tục|Start or resume/i }).click();
  const reopened = await data(await pending);
  expect(reopened.importId).toBe(started.importId);
  expect(reopened.status).toBe("finalized");
  expect(Array.isArray(reopened.receipts) && reopened.receipts.length).toBe(2);
});
