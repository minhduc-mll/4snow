import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("disabled import keeps local and trusted preview available", async ({ page }) => {
  await page.route("**/api/admin/login", route => route.fulfill({ json: { token: "test-token", expiresAt: Date.now() + 60000 } }));
  await page.route("https://test-supabase.invalid/functions/v1/vtv-dictionary", async route => {
    const body: unknown = route.request().postDataJSON();
    if (typeof body !== "object" || body === null || !("requestId" in body) || !("operation" in body) || body.operation !== "import-preview") throw new Error("Unexpected operation");
    await route.fulfill({ json: { ok: true, requestId: body.requestId, data: { valid: true, entryCount: 1, collisionCount: 0, duplicateCount: 0, conflictCount: 0, canonicalHash: "0".repeat(64), errors: [], errorsTruncated: false } } });
  });
  await page.goto("/admin#dictionary/import");
  await page.getByLabel(/Tài khoản|Username/i).fill("admin");
  await page.getByLabel(/Mật khẩu|Password/i).fill("password");
  await page.getByRole("button", { name: /Đăng nhập|Sign in|Log in/i }).click();
  await page.locator("#dictionary-preview-file").setInputFiles({ name: "synthetic.json", mimeType: "application/json", buffer: readFileSync("tests/vua-tieng-viet/fixtures/synthetic.json") });
  await expect(page.getByRole("region", { name: /Kiểm tra trên trình duyệt|Local preview/i })).toBeVisible();
  await expect(page.getByRole("region", { name: /Kiểm tra tin cậy|Trusted preview/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Bắt đầu hoặc tiếp tục|Start or resume/i })).toBeDisabled();
  await page.getByRole("navigation", { name: /Các bước quản lý từ điển|Dictionary workflow steps/i }).getByRole("link", { name: /Duyệt|Review/i }).click();
  await expect(page.getByRole("status")).toContainText(/Chưa thể nhập|disabled/i);
});
