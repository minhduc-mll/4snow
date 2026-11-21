import { expect, test } from "@playwright/test";

test("dictionary steps support direct links, back and retained filters on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route("**/api/admin/login", route => route.fulfill({ json: { token: "test-token", expiresAt: Date.now() + 60000 } }));
  await page.route("**/api/admin/verify", route => route.fulfill({ json: { valid: true, expiresAt: Date.now() + 60000 } }));
  await page.route("https://test-supabase.invalid/functions/v1/vtv-dictionary", async route => {
    const body: unknown = route.request().postDataJSON();
    if (typeof body !== "object" || body === null || !("requestId" in body)) throw new Error("Missing request ID");
    await route.fulfill({ json: { ok: true, requestId: body.requestId, data: { items: [], nextCursor: null, draftRevision: "0" } } });
  });
  await page.goto("/admin#dictionary/review");
  await page.getByLabel(/Tài khoản|Username/i).fill("admin");
  await page.getByLabel(/Mật khẩu|Password/i).fill("password");
  await page.getByRole("button", { name: /Đăng nhập|Sign in|Log in/i }).click();
  const nav = page.getByRole("navigation", { name: /Các bước quản lý từ điển|Dictionary workflow steps/i });
  await expect(nav.getByRole("link", { name: /Duyệt|Review/i })).toHaveAttribute("aria-current", "step");
  await page.getByText("Bộ lọc khác", { exact: true }).click();
  const source = page.getByLabel(/Mã nguồn|Source ID/i);
  await source.fill("retained-filter");
  await nav.getByRole("link", { name: /Nhập|Import/i }).click();
  await expect(page.locator("#dictionary-preview-file")).toBeVisible();
  await page.goBack();
  await expect(source).toHaveValue("retained-filter");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.reload();
  await expect(nav.getByRole("link", { name: /Duyệt|Review/i })).toHaveAttribute("aria-current", "step");
});

test("a failed candidate list can be retried without leaving the review step", async ({ page }) => {
  let calls = 0;
  let unavailable = true;
  await page.route("**/api/admin/login", route => route.fulfill({ json: { token: "test-token", expiresAt: Date.now() + 60000 } }));
  await page.route("https://test-supabase.invalid/functions/v1/vtv-dictionary", async route => {
    const body: unknown = route.request().postDataJSON();
    if (typeof body !== "object" || body === null || !("requestId" in body)) throw new Error("Missing request ID");
    calls++;
    if (unavailable) return route.fulfill({ status: 503 });
    return route.fulfill({ json: { ok: true, requestId: body.requestId, data: { items: [], nextCursor: null, draftRevision: "0" } } });
  });
  await page.goto("/admin#dictionary/review");
  await page.getByLabel(/Tài khoản|Username/i).fill("admin");
  await page.getByLabel(/Mật khẩu|Password/i).fill("password");
  await page.getByRole("button", { name: /Đăng nhập|Sign in|Log in/i }).click();
  const retry = page.getByRole("button", { name: /Thử lại an toàn|Retry safely/i });
  await expect(retry).toBeVisible();
  const failedCalls = calls;
  unavailable = false;
  await retry.click();
  await expect.poll(() => calls).toBeGreaterThan(failedCalls);
  await expect(page.getByRole("button", { name: /Thử lại an toàn|Retry safely/i })).toHaveCount(0);
});
