import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("admin-auth-token", "session"));
  await page.route("**/api/admin/verify", route => route.fulfill({ json: { valid: true, expiresAt: Date.now() + 60000 } }));
});

test("prize editors preserve changes and require confirmation before removal", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/admin#lucky-draw");
  const add = page.getByRole("button", { name: /Thêm giải|Add prize/i });
  await expect(add).toHaveCount(1);
  await add.click();
  const name = page.getByLabel(/Tên giải|Prize name/i).last();
  await name.fill("Special award");
  const summary = page.getByRole("button", { name: /Special award.*1/ });
  await expect(summary).toHaveAttribute("aria-expanded", "true");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(summary).toHaveAttribute("aria-expanded", "false");
  await summary.press("Enter");
  await expect(name).toHaveValue("Special award");
  await page.getByRole("button", { name: /Lưu cấu hình|Save config/i }).click();
  await page.reload();
  await expect(summary).toBeVisible();
  await page.getByRole("button", { name: /Xóa giải Special award|Remove prize Special award/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(/không thể khôi phục|cannot be restored/i);
  await dialog.getByRole("button", { name: /Hủy|Cancel/i }).click();
  await expect(summary).toBeVisible();
  await page.getByRole("button", { name: /Xóa giải Special award|Remove prize Special award/i }).click();
  await dialog.getByRole("button", { name: /Xác nhận xóa|Confirm deletion/i }).click();
  await expect(summary).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Xóa giải First Prize|Remove prize First Prize/i })).toBeDisabled();
  await page.getByRole("button", { name: /Lưu cấu hình|Save config/i }).click();
  await page.reload();
  await expect(summary).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("saved result history can be reviewed and cleared only after confirmation", async ({ page }) => {
  await page.addInitScript(() => {
    const config = { id: "default", name: "Lucky Draw", ticketRange: { from: 0, to: 999, except: [] }, prizes: [{ id: "first_prize", name: "First Prize", winners_count: 1, order: 1 }] };
    const result = { id: "result-1", configId: "default", prizeId: "first_prize", prizeName: "First Prize", winners: ["002"], createdAt: "2026-01-01T00:00:00Z", drawSettingsSnapshot: { from: 0, to: 999, displayDigits: 3, except: [], winners_count: 1 } };
    localStorage.setItem("lucky-draw:config:v1", JSON.stringify({ version: 1, config }));
    localStorage.setItem("lucky-draw:results:v1", JSON.stringify({ version: 1, results: [result] }));
  });
  await page.goto("/admin#lucky-draw");
  await expect(page.getByText("002", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Thêm giải|Add prize/i }).click();
  await page.getByRole("button", { name: /Lưu cấu hình|Save config/i }).click();
  await page.reload();
  await expect(page.getByText("002", { exact: true })).toBeVisible();
  const clear = page.getByRole("button", { name: /Xóa tất cả kết quả|Clear all results/i });
  await clear.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(/không thể khôi phục|cannot be restored/i);
  await dialog.getByRole("button", { name: /Hủy|Cancel/i }).click();
  await expect(page.getByText("002", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const original = Storage.prototype.removeItem;
    let failed = false;
    Storage.prototype.removeItem = function(key) {
      if (key === "lucky-draw:results:v1" && !failed) { failed = true; throw new Error("storage denied"); }
      return original.call(this, key);
    };
  });
  await clear.click();
  await dialog.getByRole("button", { name: /Xác nhận xóa|Confirm deletion/i }).click();
  await expect(page.getByRole("alert").filter({ hasText: /Không thể lưu dữ liệu|Could not save data/i })).toBeVisible();
  await expect(page.getByText("002", { exact: true })).toBeVisible();
  await clear.click();
  await dialog.getByRole("button", { name: /Xác nhận xóa|Confirm deletion/i }).click();
  await expect(page.getByText("002", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("lucky-draw:results:v1"))).toBeNull();
  await expect(clear).toBeDisabled();
});
