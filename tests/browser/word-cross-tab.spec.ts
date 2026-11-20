import { test, expect, type Page } from "@playwright/test";
import { dictionary, input, start, submit } from "./helpers/word-game";
import { decodeRoundSave } from "../../lib/vua-tieng-viet/round-save";

const conflict = (page: Page) => page.getByRole("dialog",{ name: "Ván lưu đã thay đổi ở thẻ khác" });
async function saved(page: Page) {
  const value = await page.evaluate(() => localStorage.getItem("vtv:round:v1"));
  if (value === null) throw new Error("Expected recoverable round");
  return value;
}

test("same-round edits pause other tabs; load-saved restores exact input and focus", async ({ page, context }) => {
  await dictionary(page); await start(page);
  const other = await context.newPage(); await dictionary(other); await other.goto("/vua-tieng-viet");
  await expect(input(other)).toBeEnabled();
  await input(page).fill("M");
  const dialog = other.getByRole("dialog",{ name: "Ván lưu đã thay đổi ở thẻ khác" });
  await expect(dialog).toBeVisible();
  await expect(other.getByRole("textbox",{ name: /Nhập từ tiếng Việt/, includeHidden: true })).toHaveValue("");
  await other.keyboard.press("Escape"); await expect(dialog).toBeVisible();
  await dialog.getByRole("button",{ name: "Tải ván đang lưu", exact: true }).click();
  await expect(dialog).toBeHidden(); await expect(input(other)).toHaveValue("M");
  await expect(input(other)).toBeFocused();
  await input(other).fill("mèo"); await submit(other).click();
  await expect(other.getByText("Chuỗi hiện tại: 1", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog",{ name: "Ván lưu đã thay đổi ở thẻ khác" })).toBeVisible();
  await page.getByRole("button",{ name: "Tải ván đang lưu", exact: true }).click();
  await expect(page.getByText("Chúc mừng! Bạn đã tìm ra đáp án.")).toBeVisible();
  await expect(page.getByText("Chuỗi hiện tại: 1", { exact: true })).toBeVisible();
  await expect(page.getByRole("button",{ name: "Chơi lại", exact: true })).toBeFocused();
  await other.reload();
  await expect(other.getByText("Chuỗi hiện tại: 1", { exact: true })).toBeVisible();
});

test("keep-this-round replaces a different round without merging its accepted history", async ({ page, context }) => {
  await dictionary(page); await start(page, 3, "dictionary", "strict");
  const original = decodeRoundSave(await saved(page));
  const other = await context.newPage(); await dictionary(other); await other.goto("/vua-tieng-viet"); await expect(input(other)).toBeEnabled();
  await input(page).fill("MEO"); await submit(page).click();
  await expect(conflict(other)).toBeVisible();
  await page.getByRole("button",{ name: "Cài đặt", exact: true }).click();
  await page.getByRole("button",{ name: "5 chữ", exact: true }).click();
  await page.getByRole("button",{ name: "Tải ván mới", exact: true }).click();
  await expect(page.getByText(/5 chữ · Từ điển · /)).toBeVisible();
  await other.getByRole("button",{ name: "Giữ ván này và thay bản lưu", exact: true }).click();
  await expect(conflict(other)).toBeHidden(); await expect(input(other)).toHaveValue(""); await expect(input(other)).toBeFocused();
  const kept = decodeRoundSave(await saved(other));
  expect(kept.round.id).toBe(original.round.id); expect(kept.round.guesses).toHaveLength(0);
  await expect(conflict(page)).toBeVisible();
  await page.getByRole("button",{ name: "Tải ván đang lưu", exact: true }).click();
  await expect(page.getByText(/3 chữ · Từ điển · /)).toBeVisible();
  await expect(input(page)).toHaveValue("");
});

test("a delayed storage event cannot let an equal-revision writer overwrite another tab", async ({ page, context }) => {
  await dictionary(page); await start(page);
  const other = await context.newPage(); await dictionary(other);
  await other.addInitScript(() => window.addEventListener("storage",event => event.stopImmediatePropagation(),true));
  await other.goto("/vua-tieng-viet"); await expect(input(other)).toBeEnabled();
  await input(page).fill("M");
  await expect.poll(async () => decodeRoundSave(await saved(page)).round.input).toBe("M");
  await input(other).fill("S"); await expect(conflict(other)).toBeVisible();
  expect(decodeRoundSave(await saved(page)).round.input).toBe("M");
  await other.getByRole("button",{ name: "Giữ ván này và thay bản lưu", exact: true }).click();
  await expect(conflict(other)).toBeHidden();
  const kept = decodeRoundSave(await saved(other)); expect(kept.round.input).toBe("S"); expect(kept.round.revision).toBeGreaterThan(1);
  await expect(conflict(page)).toBeVisible();
});

test("resolution quota/access failures preserve both histories and allow retry", async ({ page, context }) => {
  await dictionary(page); await start(page);
  const other = await context.newPage(); await dictionary(other); await other.goto("/vua-tieng-viet"); await expect(input(other)).toBeEnabled();
  await input(page).fill("M"); await expect(conflict(other)).toBeVisible(); const before = await saved(page);
  await other.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key: string,value: string) { if (key === "vtv:round:v1") throw new DOMException("quota","QuotaExceededError"); original.call(this,key,value); };
    window.addEventListener("restore-write",() => { Storage.prototype.setItem = original; },{ once: true });
  });
  await other.getByRole("button",{ name: "Giữ ván này và thay bản lưu", exact: true }).click();
  await expect(conflict(other).getByRole("alert")).toContainText("Chưa đọc hoặc ghi được");
  expect(await saved(page)).toBe(before);
  await other.evaluate(() => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function(key: string) { if (key === "vtv:round:v1") throw new DOMException("denied","SecurityError"); return original.call(this,key); };
    window.addEventListener("restore-read",() => { Storage.prototype.getItem = original; },{ once: true });
  });
  await other.getByRole("button",{ name: "Tải ván đang lưu", exact: true }).click();
  await expect(conflict(other).getByRole("alert")).toContainText("Chưa đọc hoặc ghi được");
  expect(await saved(page)).toBe(before);
  await other.evaluate(() => { window.dispatchEvent(new Event("restore-write")); window.dispatchEvent(new Event("restore-read")); });
  await other.getByRole("button",{ name: "Tải ván đang lưu", exact: true }).click();
  await expect(conflict(other)).toBeHidden(); await expect(input(other)).toHaveValue("M"); await expect(input(other)).toBeFocused();
});

test("a competing save invalidates an asynchronous replacement even after explicit recovery", async ({ page, context }) => {
  await dictionary(page); await start(page);
  const other = await context.newPage(); await dictionary(other); await other.goto("/vua-tieng-viet"); await expect(input(other)).toBeEnabled();
  const gate = Promise.withResolvers<void>(), requested = Promise.withResolvers<void>(), finished = Promise.withResolvers<void>();
  await page.route("https://test-supabase.invalid/rest/v1/vtv_current_release**",async route => {
    requested.resolve(); await gate.promise; await route.fallback().catch(() => {}); finished.resolve();
  });
  await page.getByRole("button",{ name: "Cài đặt", exact: true }).click();
  await page.getByRole("button",{ name: "5 chữ", exact: true }).click();
  await page.getByRole("button",{ name: "Tải ván mới", exact: true }).click(); await requested.promise;
  await input(other).fill("M"); await expect(conflict(page)).toBeVisible();
  await page.getByRole("button",{ name: "Tải ván đang lưu", exact: true }).click();
  await expect(input(page)).toHaveValue("M"); await expect(input(page)).toBeFocused(); const recovered = await saved(page);
  gate.resolve(); await finished.promise;
  await expect(page.getByText(/3 chữ · Từ điển · /)).toBeVisible();
  expect(await saved(page)).toBe(recovered);
});

test("cancelled or failed replacement preserves the recoverable save and focus", async ({ page, context }) => {
  const remote = await dictionary(page); await start(page); await input(page).fill("m");
  await expect.poll(async () => decodeRoundSave(await saved(page)).round.input).toBe("m"); const before = await saved(page);
  const other = await context.newPage(); await dictionary(other); await other.goto("/vua-tieng-viet"); await expect(input(other)).toHaveValue("m");
  const five = page.getByRole("button",{ name: "5 chữ", exact: true });
  const settings = page.getByRole("button",{ name: "Cài đặt", exact: true });
  await settings.click(); await five.click(); await page.getByRole("button",{ name: "Hủy", exact: true }).click();
  await expect(settings).toBeFocused(); expect(await saved(page)).toBe(before);
  remote.fail = true; await settings.click(); await five.click(); await page.getByRole("button",{ name: "Tải ván mới", exact: true }).click();
  await expect(page.locator("#vtv-message")).toContainText("Chưa tải được");
  await expect(input(page)).toHaveValue("m"); expect(await saved(page)).toBe(before);
  remote.fail = false;
  await page.evaluate(() => { Object.defineProperty(Crypto.prototype,"getRandomValues",{ configurable: true, value: () => { throw new Error("test random failure"); } }); });
  await page.getByRole("button",{ name: "Thử lại tải ván mới", exact: true }).click();
  await expect(page.locator("#vtv-message")).toContainText("an toàn"); expect(await saved(page)).toBe(before);
  await expect(conflict(other)).toBeHidden();
  await other.reload(); await expect(input(other)).toHaveValue("m");
});

test("a corrupt or removed foreign save requires explicit choice and never silently repairs history", async ({ page, context }) => {
  await dictionary(page); await start(page);
  const other = await context.newPage(); await dictionary(other); await other.goto("/vua-tieng-viet"); await expect(input(other)).toBeEnabled();
  await page.evaluate(() => localStorage.setItem("vtv:round:v1","broken"));
  await expect(conflict(other)).toBeVisible();
  await other.getByRole("button",{ name: "Tải ván đang lưu", exact: true }).click();
  await expect(conflict(other).getByRole("alert")).toContainText("Ván đang lưu bị lỗi");
  expect(await saved(page)).toBe("broken");
  await other.getByRole("button",{ name: "Giữ ván này và thay bản lưu", exact: true }).click();
  await expect(conflict(other)).toBeHidden();
  expect(decodeRoundSave(await saved(other)).round.guesses).toHaveLength(0);
  await page.evaluate(() => localStorage.clear());
  await expect(conflict(other)).toBeVisible();
  await other.getByRole("button",{ name: "Tải ván đang lưu", exact: true }).click();
  await expect(conflict(other)).toBeHidden();
  await expect(other.getByRole("button",{ name: "Bắt đầu ván", exact: true })).toBeFocused();
  expect(await other.evaluate(() => localStorage.getItem("vtv:round:v1"))).toBeNull();
});
