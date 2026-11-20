import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { isRecord, parsePublicationRequest } from "../../lib/vua-tieng-viet/publication-contract";
import { fixtureId } from "../vua-tieng-viet/player-fixture";

async function backend(context: BrowserContext) {
  let revision = 0, attempts = 6, initialAbsentCount = 0, configurationId = fixtureId(91), builds = 0;
  const control = { loseResponse: false, commits: 0, liveAttempts: 6, liveInitialAbsentCount: 0, liveConfigurationId: configurationId };
  const receipts = new Map<string,object>();
  await context.route("**/api/admin/verify",route => route.fulfill({ json: { valid: true, expiresAt: Date.now() + 60000 } }));
  await context.route("https://test-supabase.invalid/functions/v1/vtv-dictionary",async route => {
    expect(route.request().headers().authorization).toBe("Bearer test-token");
    const body: unknown = route.request().postDataJSON();
    if (!isRecord(body)) throw new Error("Invalid request");
    const envelope = { ok: true, requestId: body.requestId };
    if (body.operation === "list") return route.fulfill({ json: { ...envelope,data: { items: [],nextCursor: null,draftRevision: String(revision) } } });
    const request = parsePublicationRequest(body);
    if (request.operation === "publication-game") throw new Error("Unexpected preview round");
    const receipt = receipts.get(request.idempotencyKey);
    if (receipt) return route.fulfill({ json: { ...envelope,data: receipt } });
    if (request.input.expectedDraftRevision !== String(revision)) return route.fulfill({ status: 409,json: { ok: false, requestId: body.requestId, error: { code: "REVISION_CONFLICT", message: "Revision conflict" } } });
    if (request.operation === "publication-preview") {
      builds++;
      return route.fulfill({ json: { ...envelope,data: { buildId: fixtureId(300+builds),contentHash: "a".repeat(64),valid: true,errors: [],errorCount: 0,payloadBytes: 1024,changes: Object.fromEntries([3,5,7,9].map(n => [n,{ guesses: { added: 0, removed: 0 }, answers: { added: 0, removed: 0 } }])),coverage: Object.fromEntries([3,5,7,9].map(n => [n,{ guesses: 1,answers: 1 }])),draftRevision: String(revision),expectedCurrentReleaseId: fixtureId(90),configuration: { configurationId,attemptLimit: attempts,initialAbsentCount,normalizerVersion: "vi-nfc-v2" },sourceCount: 1,sources: [{ id: fixtureId(80), name: "Synthetic source", revision: "source-v1" }],attributionCount: 1,playerSamples: { "3": [],"5": [],"7": [],"9": [] },sampleAttributions: [] } } });
    }
    if (request.operation === "configuration") {
      attempts = request.input.attemptLimit; initialAbsentCount = request.input.initialAbsentCount ?? initialAbsentCount; revision++; configurationId = fixtureId(200+revision); control.commits++;
      const result = { draftRevision: String(revision),configuration: { configurationId,attemptLimit: attempts,initialAbsentCount,normalizerVersion: "vi-nfc-v2",levels: [3,5,7,9] } };
      receipts.set(request.idempotencyKey,result);
      if (control.loseResponse) { control.loseResponse = false; return route.abort(); }
      return route.fulfill({ json: { ...envelope,data: result } });
    }
    control.liveAttempts = attempts; control.liveInitialAbsentCount = initialAbsentCount; control.liveConfigurationId = configurationId; revision++;
    return route.fulfill({ json: { ...envelope,data: { releaseId: fixtureId(500+revision),configurationId,payloadHash: "a".repeat(64),publishedAt: "2026-11-15T00:00:00Z",pointerRevision: String(revision) } } });
  });
  return control;
}
async function admin(page: Page) {
  await page.addInitScript(() => localStorage.setItem("admin-auth-token","test-token"));
  await page.goto("/admin#dictionary/publish");
  await expect(page.getByRole("button",{ name: /Làm mới bản xem trước/ })).toBeEnabled();
  await page.getByRole("button",{ name: /Làm mới bản xem trước/ }).click();
  await expect(page.getByLabel("Số lượt đoán (1–12)")).toHaveValue("6");
}
test("bounded attempt drafts retry safely and stay private until a refreshed release is published", async ({ page, context }) => {
  const control = await backend(context); await admin(page);
  const field = page.getByLabel("Số lượt đoán (1–12)"), save = page.getByRole("button",{ name: "Lưu cấu hình nháp",exact: true });
  for (const invalid of ["0","13","1.5"]) { await field.fill(invalid); await expect(save).toBeDisabled(); await expect(page.getByText("Nhập số nguyên từ 1 đến 12.")).toBeVisible(); }
  const clues = page.getByLabel("Số phím vắng mặt lúc bắt đầu (0–17)");
  await field.fill("1");
  for (const invalid of ["-1","18","1.5"]) {
    await clues.fill(invalid);
    await expect(save).toBeDisabled();
    await expect(page.getByText("Nhập số nguyên từ 0 đến 17.")).toBeVisible();
  }
  expect(control.commits).toBe(0);
  await clues.fill("17");
  await field.fill("1"); control.loseResponse = true; await save.click();
  await page.getByRole("button",{ name: /Thử lại an toàn/ }).click();
  await expect(field).toHaveValue("1"); await expect(clues).toHaveValue("17"); await expect(save).toBeDisabled(); expect(control.commits).toBe(1);
  expect(control.liveAttempts).toBe(6); expect(control.liveConfigurationId).toBe(fixtureId(91)); expect(control.liveInitialAbsentCount).toBe(0);
  const publish = page.getByRole("button",{ name: /Xuất bản bản đã duyệt/ }); await expect(publish).toBeDisabled();
  await page.getByRole("button",{ name: /Làm mới bản xem trước/ }).click();
  await expect(publish).toBeEnabled(); await publish.click();
  await page.getByRole("button", { name: "Xác nhận xuất bản", exact: true }).click();
  await expect.poll(() => control.liveAttempts).toBe(1); expect(control.liveConfigurationId).not.toBe(fixtureId(91)); expect(control.liveInitialAbsentCount).toBe(17);
});
test("concurrent configuration and publication reject stale drafts without silently rebasing", async ({ page, context }) => {
  const control = await backend(context); await admin(page);
  const other = await context.newPage(); await admin(other);
  await page.getByLabel("Số lượt đoán (1–12)").fill("12"); await page.getByRole("button",{ name: "Lưu cấu hình nháp",exact: true }).click();
  await expect(page.getByLabel("Số lượt đoán (1–12)")).toHaveValue("12");
  await other.getByLabel("Số lượt đoán (1–12)").fill("1"); await other.getByRole("button",{ name: "Lưu cấu hình nháp",exact: true }).click();
  await expect(other.getByRole("alert").filter({ hasText: /đã cũ/ })).toBeVisible(); expect(control.commits).toBe(1); expect(control.liveAttempts).toBe(6);
  await other.getByRole("button",{ name: /Làm mới bản xem trước/ }).click();
  await expect(other.getByLabel("Số lượt đoán (1–12)")).toHaveValue("12");
  // This tab's preview becomes stale when another configuration is committed.
  await page.getByLabel("Số lượt đoán (1–12)").fill("6"); await page.getByRole("button",{ name: "Lưu cấu hình nháp",exact: true }).click();
  await expect.poll(() => control.commits).toBe(2);
  await other.getByRole("button",{ name: /Xuất bản bản đã duyệt/ }).click();
  await other.getByRole("button", { name: "Xác nhận xuất bản", exact: true }).click();
  await expect(other.getByRole("alert").filter({ hasText: /đã cũ/ })).toBeVisible(); expect(control.liveAttempts).toBe(6);
});
