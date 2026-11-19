import { expect, test } from "@playwright/test";

test("protected sections support direct links, refresh and browser history", async ({ page }) => {
  await page.route("**/api/admin/login", route => route.fulfill({ json: { token: "session", expiresAt: Date.now() + 60000 } }));
  await page.route("**/api/admin/verify", route => route.fulfill({ json: { valid: true, expiresAt: Date.now() + 60000 } }));
  await page.goto("/admin#quiz");
  await expect(page.getByLabel(/Tài khoản|Username/i)).toBeVisible();
  await expect(page.getByRole("navigation", { name: /Điều hướng quản trị|Admin navigation/i })).toHaveCount(0);
  await page.getByLabel(/Tài khoản|Username/i).fill("admin");
  await page.getByLabel(/Mật khẩu|Password/i).fill("password");
  await page.getByRole("button", { name: /Đăng nhập|Log in/i }).click();
  const navigation = page.getByRole("navigation", { name: /Điều hướng quản trị|Admin navigation/i });
  await expect(navigation.getByRole("link", { name: /Quiz/ })).toHaveAttribute("aria-current", "page");
  await page.reload();
  await expect(navigation.getByRole("link", { name: /Quiz/ })).toHaveAttribute("aria-current", "page");
  await navigation.getByRole("link", { name: /Lucky Draw/ }).click();
  await expect(page).toHaveURL(/#lucky-draw$/);
  await page.goBack();
  await expect(navigation.getByRole("link", { name: /Quiz/ })).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: /Đăng xuất|Log out/i }).click();
  await expect(page.getByLabel(/Tài khoản|Username/i)).toBeVisible();
});

test("mobile navigation is keyboard accessible and fits the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(() => localStorage.setItem("admin-auth-token", "session"));
  await page.route("**/api/admin/verify", route => route.fulfill({ json: { valid: true, expiresAt: Date.now() + 60000 } }));
  await page.goto("/admin");
  const menu = page.locator("summary");
  await menu.focus();
  await page.keyboard.press("Enter");
  const navigation = page.getByRole("navigation", { name: /Điều hướng quản trị|Admin navigation/i });
  await navigation.getByRole("link", { name: /Quiz/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#quiz$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("direct links hide protected content while the session is verified", async ({ page }) => {
  let releaseVerification: (() => void) | undefined;
  const verification = new Promise<void>(resolve => { releaseVerification = resolve; });
  await page.addInitScript(() => localStorage.setItem("admin-auth-token", "session"));
  await page.route("**/api/admin/verify", async route => {
    await verification;
    await route.fulfill({ json: { valid: true, expiresAt: Date.now() + 60000 } });
  });
  await page.goto("/admin#lucky-draw");
  await expect(page.getByRole("navigation", { name: /Điều hướng quản trị|Admin navigation/i })).toHaveCount(0);
  releaseVerification?.();
  await expect(page.getByRole("navigation", { name: /Điều hướng quản trị|Admin navigation/i }).getByRole("link", { name: /Lucky Draw/ })).toHaveAttribute("aria-current", "page");
});

test("returning to a section restores its scroll position", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.addInitScript(() => localStorage.setItem("admin-auth-token", "session"));
  await page.route("**/api/admin/verify", route => route.fulfill({ json: { valid: true, expiresAt: Date.now() + 60000 } }));
  await page.goto("/admin#lucky-draw");
  const navigation = page.getByRole("navigation", { name: /Điều hướng quản trị|Admin navigation/i });
  await expect(navigation.getByRole("link", { name: /Lucky Draw/ })).toHaveAttribute("aria-current", "page");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  const position = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => { window.location.hash = "quiz"; });
  await expect(navigation.getByRole("link", { name: /Quiz/ })).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(position - 20);
});
