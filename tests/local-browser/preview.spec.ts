import { test, expect } from "@playwright/test";

test("real local admin login and trusted Supabase preview, then logout cleanup", async ({ page }) => {
  test.setTimeout(90000);
  await page.goto("/admin#dictionary");
  await page.getByLabel(/Tài khoản|Username/i).fill("local-verification-admin");
  const password = process.env.VTV_LOCAL_TEST_PASSWORD;
  if (!password) throw new Error("Local verification password missing");
  await page.getByLabel(/Mật khẩu|Password/i).fill(password);
  await page.getByRole("button", { name: /Đăng nhập|Sign in|Log in/i }).click();
  await expect(page.locator("#dictionary-preview-file")).toBeVisible();
  const trustedResponse = () => page.waitForResponse((response) => {
    if (!response.url().endsWith("/functions/v1/vtv-dictionary") || response.request().method() !== "POST") return false;
    const input: unknown = response.request().postDataJSON();
    return typeof input === "object" && input !== null && "operation" in input && input.operation === "import-preview";
  });
  let trusted = trustedResponse();
  await page.locator("#dictionary-preview-file").setInputFiles("tests/vua-tieng-viet/fixtures/synthetic.json");
  let response = await trusted;
  if (response.status() === 429) {
    const seconds = Number(response.headers()["retry-after"]);
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(60);
    let remaining = seconds * 1000 + 100;
    while (remaining > 0) { const interval = Math.min(remaining, 10000); await page.waitForTimeout(interval); remaining -= interval; }
    trusted = trustedResponse();
    await page.locator("#dictionary-preview-file").setInputFiles("tests/vua-tieng-viet/fixtures/synthetic.json");
    response = await trusted;
  }
  expect(response.status()).toBe(200);
  const result: unknown = await response.json();
  if (typeof result !== "object" || result === null || !("data" in result) || typeof result.data !== "object" || result.data === null || !("valid" in result.data)) throw new Error("Invalid trusted preview response");
  expect(result.data.valid).toBe(true);
  await expect(page.getByRole("heading", { name: /Kiểm tra tin cậy|Trusted preview/i })).toBeVisible();
  await page.getByRole("button", { name: /Đăng xuất|Log out/i }).click();
  await expect(page.locator("#dictionary-preview-file")).toHaveCount(0);
  await expect(page.getByLabel(/Tài khoản|Username/i)).toBeVisible();
});
