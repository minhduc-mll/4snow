import { test, expect } from "@playwright/test";

const login = async (page: import("@playwright/test").Page) => {
  await page.getByLabel(/Tài khoản|Username/i).fill("admin");
  await page.getByLabel(/Mật khẩu|Password/i).fill("password");
  await page.getByRole("button", { name: /Đăng nhập|Sign in|Log in/i }).click();
};

test("login, refresh and cross-tab logout share the session", async ({ context, page }) => {
  await context.route("**/api/admin/login", route => route.fulfill({ json: { token: "session", expiresAt: Date.now() + 60000 } }));
  await context.route("**/api/admin/verify", route => route.fulfill({ json: { valid: true, expiresAt: Date.now() + 60000 } }));
  await page.goto("/admin"); await login(page);
  await expect(page.getByRole("button", { name: /Đăng xuất|Log out/i })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /Đăng xuất|Log out/i })).toBeVisible();
  const other = await context.newPage(); await other.goto("/admin");
  await expect(other.getByRole("button", { name: /Đăng xuất|Log out/i })).toBeVisible();
  await other.getByRole("button", { name: /Đăng xuất|Log out/i }).click();
  await expect(page.getByLabel(/Tài khoản|Username/i)).toBeVisible();
});

test("denied storage fails closed", async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, "localStorage", { get() { throw new Error("denied"); } }); });
  await page.route("**/api/admin/login", route => route.fulfill({ json: { token: "session", expiresAt: Date.now() + 60000 } }));
  await page.goto("/admin"); await login(page);
  await expect(page.getByLabel(/Tài khoản|Username/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Đăng xuất|Log out/i })).toHaveCount(0);
});

test("late verification cannot undo cross-tab logout", async ({ context, page }) => {
  let release: (() => void) | undefined;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  let requested: (() => void) | undefined;
  const requestSeen = new Promise<void>(resolve => { requested = resolve; });
  let completed: (() => void) | undefined;
  const responseSent = new Promise<void>(resolve => { completed = resolve; });
  await context.route("**/api/admin/verify", async route => { requested?.(); await blocked; await route.fulfill({ json: { valid: true, expiresAt: Date.now() + 60000 } }); completed?.(); });
  await page.goto("/"); await page.evaluate(() => localStorage.setItem("admin-auth-token", "session"));
  const other = await context.newPage(); await other.goto("/admin", { waitUntil: "domcontentloaded" }); await requestSeen;
  await page.evaluate(() => localStorage.removeItem("admin-auth-token"));
  await expect(other.getByLabel(/Tài khoản|Username/i)).toBeVisible();
  release?.();
  await responseSent;
  await expect(other.getByRole("button", { name: /Đăng xuất|Log out/i })).toHaveCount(0);
});

test("expired verification fails closed", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("admin-auth-token", "expired"));
  await page.route("**/api/admin/verify", route => route.fulfill({ json: { valid: true, expiresAt: Date.now() - 1 } }));
  await page.goto("/admin");
  await expect(page.getByLabel(/Tài khoản|Username/i)).toBeVisible();
});
