import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("admin-auth-token", "session"));
  await page.route("**/api/admin/verify", route => route.fulfill({ json: { valid: true, expiresAt: Date.now() + 60000 } }));
  await page.goto("/admin#lucky-draw");
});

test("range, exclusions and saved configuration reflect the draw settings", async ({ page }) => {
  await page.getByLabel(/Số vé bắt đầu|Starting ticket number/i).fill("1");
  await page.getByLabel(/Số vé kết thúc|Ending ticket number/i).fill("10");
  const excluded = page.getByLabel(/Loại trừ|Except/i);
  await excluded.fill("3");
  await excluded.press("Enter");
  await expect(page.getByText(/Tổng vé trong khoảng: 10|Total tickets in range: 10/i)).toBeVisible();
  await expect(page.getByText(/Chưa xác định|Unavailable/i)).toBeVisible();
  await page.getByRole("button", { name: /Lưu cấu hình|Save config/i }).click();
  await expect(page.getByText(/Vé còn đủ điều kiện: 9|Tickets still eligible: 9/i)).toBeVisible();
  const stored: unknown = await page.evaluate(() => JSON.parse(localStorage.getItem("lucky-draw:config:v1") ?? "null"));
  expect(stored).toMatchObject({ config: { ticketRange: { from: 1, to: 10, except: ["03"] } } });
  await page.reload();
  await expect(page.getByLabel(/Số vé bắt đầu|Starting ticket number/i)).toHaveValue("1");
  await page.goto("/lucky-draw");
  await page.getByRole("button", { name: /^Quay số$|^Draw$/i }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("lucky-draw:results:v1"))).toMatch(/"winners":\["(0[12456789]|10)"\]/);
});

test("invalid range is associated with both fields", async ({ page }) => {
  const start = page.getByLabel(/Số vé bắt đầu|Starting ticket number/i);
  await start.fill("1000");
  await expect(start).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("alert").filter({ hasText: /số nguyên|whole numbers/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Lưu cấu hình|Save config/i })).toBeDisabled();
});

test("eligible count excludes saved winners as well as exclusions", async ({ page }) => {
  await page.evaluate(() => {
    const config = { id: "default", name: "Lucky Draw", ticketRange: { from: 0, to: 999, except: ["003"] }, prizes: [{ id: "first_prize", name: "First Prize", winners_count: 1, order: 1 }] };
    const result = { id: "result-1", configId: "default", prizeId: "first_prize", prizeName: "First Prize", winners: ["002"], createdAt: "2026-01-01T00:00:00Z", drawSettingsSnapshot: { from: 0, to: 999, displayDigits: 3, except: ["003"], winners_count: 1 } };
    localStorage.setItem("lucky-draw:config:v1", JSON.stringify({ version: 1, config }));
    localStorage.setItem("lucky-draw:results:v1", JSON.stringify({ version: 1, results: [result] }));
  });
  await page.reload();
  await expect(page.getByText(/Tổng vé trong khoảng: 1000|Total tickets in range: 1000/i)).toBeVisible();
  await expect(page.getByText(/Vé còn đủ điều kiện: 998|Tickets still eligible: 998/i)).toBeVisible();
});

test("failed storage stays unsaved and navigation can be cancelled", async ({ page }) => {
  await page.getByLabel(/Tên sự kiện|Event name/i).fill("Unsaved event");
  const savedConfig = await page.evaluate(() => localStorage.getItem("lucky-draw:config:v1"));
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    let failed = false;
    Storage.prototype.setItem = function(key, value) {
      if (key === "lucky-draw:results:v1" && !failed) { failed = true; throw new Error("storage denied"); }
      return original.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: /Lưu cấu hình|Save config/i }).click();
  await expect(page.getByRole("status").filter({ hasText: /Lưu thất bại|Save failed/i })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("lucky-draw:config:v1"))).toBe(savedConfig);
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("navigation", { name: /Điều hướng quản trị|Admin navigation/i }).getByRole("link", { name: /Quiz/ }).click();
  await expect(page).toHaveURL(/#lucky-draw$/);
  await expect(page.getByLabel(/Tên sự kiện|Event name/i)).toHaveValue("Unsaved event");
});
