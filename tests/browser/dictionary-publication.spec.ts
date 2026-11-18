import { test, expect } from "@playwright/test";
import { isRecord } from "../../lib/vua-tieng-viet/publication-contract";

import { playerReleaseRow } from "../vua-tieng-viet/player-fixture";

const id = "30000000-0000-4000-8000-000000000003";
test("administrator resolves preview errors, refreshes stale builds and retries committed publication", async ({ page }) => {
  await page.route("**/api/admin/login", route => route.fulfill({ json: { token: "test-token", expiresAt: Date.now() + 60000 } }));
  const releaseRow = playerReleaseRow();
  let previews = 0, publishes = 0, committed = 0;
  let retryKey: unknown;
  let unauthorized = false;
  await page.route("https://test-supabase.invalid/functions/v1/vtv-dictionary", async route => {
    const body: unknown = route.request().postDataJSON();
    if (!isRecord(body)) throw new Error("Invalid request");
    if (unauthorized) return route.fulfill({ status: 401, json: { ok: false } });
    const envelope = { ok: true, requestId: body.requestId };
    if (body.operation === "list") return route.fulfill({ json: { ...envelope, data: { items: [], nextCursor: null, draftRevision: String(previews) } } });
    if (body.operation === "publication-preview") {
      previews++;
      return route.fulfill({ json: { ...envelope, data: { buildId: id, contentHash: releaseRow.payload_sha256, valid: previews > 1, errors: previews === 1 ? [{ code: "MISSING_LEVEL", level: 3 }] : [], errorCount: previews === 1 ? 1 : 0, payloadBytes: 1024, changes: Object.fromEntries([3,5,7,9].map(n => [n,{ guesses: { added: 1, removed: 0 }, answers: { added: 1, removed: 0 } }])), coverage: Object.fromEntries([3,5,7,9].map(n => [n, { guesses: 1, answers: n === 3 && previews === 1 ? 0 : 1 }])), draftRevision: String(previews), expectedCurrentReleaseId: null, configuration: { configurationId: id, attemptLimit: 6, normalizerVersion: "vi-nfc-v2" }, sourceCount: 1, sources: [{ id, name: "Synthetic source", revision: "source-v1" }], attributionCount: 4, playerSamples: { "3": [], "5": [], "7": [], "9": [{ id, original: "tiếng Việt", normalized: "TIẾNGVIỆT", level: 9, definitionVi: "Nghĩa đã duyệt hiển thị cho người chơi.", attributionIds: [id] }] }, sampleAttributions: [{ id, sourceName: "Synthetic source", attributionText: "Public credit", licenseName: "Test", licenseVersion: null, licenseUrl: "https://example.invalid/license", entryUrl: "https://example.invalid/entry", historyUrl: null, modificationsNotice: "Modified" }] } } });
    }
    if (body.operation === "publication-game") return route.fulfill({ json: { ...envelope, data: releaseRow } });
    if (body.operation === "publish") {
      expect(body.input).toMatchObject({ buildId: id, contentHash: releaseRow.payload_sha256 });
      publishes++;
      if (publishes === 1) return route.fulfill({ status: 409, json: { ok: false, requestId: body.requestId, error: { code: "REVISION_CONFLICT", message: "Revision conflict" } } });
      if (publishes === 2) { retryKey = body.idempotencyKey; committed++; return route.abort(); }
      expect(body.idempotencyKey).toBe(retryKey);
      if (publishes === 3) return route.fulfill({ json: { ...envelope, data: { releaseId: id } } });
      return route.fulfill({ json: { ...envelope, data: { releaseId: id, configurationId: id, payloadHash: "a".repeat(64), publishedAt: "2026-11-14T00:00:00Z", pointerRevision: "1" } } });
    }
    throw new Error("Unexpected operation");
  });
  await page.goto("/admin");
  await page.getByLabel(/Tài khoản|Username/i).fill("admin");
  await page.getByLabel(/Mật khẩu|Password/i).fill("password");
  await page.getByRole("button", { name: /Đăng nhập|Sign in|Log in/i }).click();
  const card = page.locator("[data-slot=card]").filter({ has: page.getByText(/Xuất bản từ điển|Publish dictionary/i, { exact: true }) });
  const refresh = page.getByRole("button", { name: /Làm mới bản xem trước|Refresh publication preview/i });
  const publish = page.getByRole("button", { name: /Xuất bản bản đã duyệt|Publish reviewed release/i });
  await expect(publish).toBeDisabled();
  await refresh.click();
  await expect(page.getByRole("region", { name: /Lỗi xuất bản|Publication errors/i })).toBeVisible();
  await expect(publish).toBeDisabled();
  await refresh.click();
  await expect(publish).toBeEnabled();
  await expect(page.getByRole("region", { name: /Xem trước nội dung người chơi|Player content preview/i })).toContainText("Nghĩa đã duyệt hiển thị cho người chơi.");
  await expect(card.getByText(/Thêm 1, bỏ 0|1 added, 0 removed/i).first()).toBeVisible();
  const savedBefore = await page.evaluate(() => Object.entries(localStorage));
  const testRound = page.getByRole("button", { name: /Chơi thử một ván|Play a preview round/i });
  await testRound.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Chơi 3 chữ|Play 3 letters/i }).click();
  const field = dialog.getByRole("textbox");
  await field.fill("mèo");
  await field.press("Enter");
  await expect(dialog.getByText(/Bạn đã tìm ra từ|You found the word/i)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => Object.entries(localStorage))).toEqual(savedBefore);
  expect(publishes).toBe(0);
  await publish.click();
  await page.getByRole("button", { name: /^(Xác nhận xuất bản|Confirm publication)$/i }).click();
  await expect(page.getByRole("alert").filter({ hasText: /đã cũ|stale/i })).toBeVisible();
  await expect(publish).toBeDisabled();
  await refresh.click();
  await expect(publish).toBeEnabled();
  await publish.click();
  await page.getByRole("button", { name: /^(Xác nhận xuất bản|Confirm publication)$/i }).click();
  await page.getByRole("button", { name: /Thử lại an toàn|Retry safely/i }).click();
  await expect.poll(() => publishes).toBe(3);
  await page.getByRole("button", { name: /Thử lại an toàn|Retry safely/i }).click();
  await expect.poll(() => publishes).toBe(4);
  await expect(card).toContainText(/Đã xuất bản|Published release/i);
  expect(committed).toBe(1);
  await expect(refresh).toBeEnabled();
  unauthorized = true;
  await refresh.click({ timeout: 2000 }).catch(() => {}); // A background invalidation can sign out first.
  await expect(page.getByLabel(/Tài khoản|Username/i)).toBeVisible();
  await expect(refresh).toHaveCount(0);
});
