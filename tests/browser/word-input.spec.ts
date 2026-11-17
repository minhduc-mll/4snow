import { test, expect } from "@playwright/test";
import { dictionary, start, input, board, submit } from "./helpers/word-game";
import { playerReleaseRow } from "../vua-tieng-viet/player-fixture";
import type { Page, Locator } from "@playwright/test";

const keyboard = (page: Page) => page.getByRole("region",{ name: /Bàn phím trên màn hình|On-screen keyboard/i });
const expansion = (page: Page, letter: string) => page.getByRole("button",{ name: new RegExp(`Dấu cho ${letter}|Variants for ${letter}`), includeHidden: true });
const picker = (page: Page, letter: string) => page.getByRole("dialog",{ name: new RegExp(`Dấu cho ${letter}|Variants for ${letter}`) });
async function paste(page: Page, text: string) {
  await input(page).evaluate((element,value) => { const data = new DataTransfer(); data.setData("text/plain",value); element.dispatchEvent(new ClipboardEvent("paste",{ clipboardData: data, bubbles: true, cancelable: true })); },text);
}
async function textContrast(locator: Locator) {
  return locator.evaluate(element => {
    const style = getComputedStyle(element);
    const luminance = (color: string) => {
      const parts = color.match(/[\d.]+/g);
      if (!parts || parts.length < 3) throw new Error("Unsupported color");
      const rgb = parts.slice(0,3).map(Number).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
      return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
    };
    const foreground = luminance(style.color), background = luminance(style.backgroundColor);
    return (Math.max(foreground,background) + .05) / (Math.min(foreground,background) + .05);
  });
}

test("ordinary keys and separate Vietnamese expansions preserve focus and cancellation",async ({ page }) => {
  await dictionary(page); await start(page);
  const keyboard = page.getByRole("region",{ name: /Bàn phím trên màn hình|On-screen keyboard/i });
  await keyboard.getByRole("button",{ name: "E", exact: true }).click();
  await expect(input(page)).toHaveValue("E");
  await input(page).fill("");
  const expand = page.getByRole("button",{ name: /Dấu cho E|Variants for E/i, includeHidden: true });
  await expand.click();
  await expect(expand).toHaveAttribute("aria-expanded","true");
  const picker = page.getByRole("dialog",{ name: /Dấu cho E|Variants for E/i });
  await picker.getByRole("button",{ name: /Nhập chữ Ế|Enter letter Ế/i }).click();
  await expect(picker).toHaveCount(0); await expect(input(page)).toHaveValue("Ế"); await expect(input(page)).toBeFocused();
  await expand.click(); await page.keyboard.press("Escape");
  await expect(picker).toHaveCount(0); await expect(expand).toBeFocused(); await expect(input(page)).toHaveValue("Ế");
});

test("every Vietnamese group exposes the full NFC alphabet and selection appends one letter",async ({ page }) => {
  await dictionary(page); await start(page);
  const groups = [
    ["A","AÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬ"], ["E","EÈÉẺẼẸÊỀẾỂỄỆ"], ["I","IÌÍỈĨỊ"],
    ["O","OÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢ"], ["U","UÙÚỦŨỤƯỪỨỬỮỰ"], ["Y","YỲÝỶỸỴ"], ["D","DĐ"],
  ];
  for (const [base,letters] of groups) {
    await input(page).fill("M"); await expansion(page,base).click();
    const dialog = picker(page,base), choices = dialog.getByRole("button",{ name: /Nhập chữ|Enter letter/i });
    await expect(choices).toHaveText(Array.from(letters));
    const chosen = Array.from(letters).at(-1);
    await dialog.getByRole("button",{ name: new RegExp(`(Nhập chữ|Enter letter) ${chosen}$`) }).click();
    await expect(input(page)).toHaveValue(`M${chosen}`); await expect(input(page)).toBeFocused();
    await expect(dialog).toHaveCount(0);
  }
});

test("keyboard-only picker focus is contained; Escape and outside dismissal preserve input",async ({ page }) => {
  await dictionary(page); await start(page);
  const trigger = expansion(page,"E");
  await trigger.focus(); await page.keyboard.press("Enter");
  const dialog = picker(page,"E");
  await expect(dialog.getByRole("button",{ name: /Nhập chữ E$|Enter letter E$/i })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button",{ name: /Đóng lựa chọn dấu|Close letter choices/i })).toBeFocused();
  await page.keyboard.press("Tab"); await page.keyboard.press("Tab"); await page.keyboard.press("Enter");
  await expect(input(page)).toHaveValue("È"); await expect(input(page)).toBeFocused();
  await trigger.click();
  await page.mouse.click(2,2);
  await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused(); await expect(input(page)).toHaveValue("È");
  await trigger.click(); await page.keyboard.press("Escape"); await expect(trigger).toBeFocused();
  await expect(input(page)).toHaveValue("È");
});

test("absent base does not disable accents; invalid and disabled pastes reject atomically",async ({ page }) => {
  await dictionary(page); await start(page);
  await paste(page,"meo"); await expect(input(page)).toHaveValue("meo"); await submit(page).click();
  await expect(keyboard(page).getByRole("button",{ name: /^E,/ })).toBeDisabled();
  await expect(expansion(page,"E")).toBeEnabled();
  await keyboard(page).getByRole("button",{ name: /^M,/ }).click();
  await paste(page,"E"); await expect(input(page)).toHaveValue("M");
  await expect(page.getByRole("status")).toContainText(/loại trừ|ruled out/i);
  await paste(page,"èo!"); await expect(input(page)).toHaveValue("M");
  await expect(page.getByRole("status")).toContainText(/Chỉ nhập chữ|supported Vietnamese letters/i);
  await expansion(page,"E").click();
  await expect(picker(page,"E").getByRole("button",{ name: /Nhập chữ E,|Enter letter E,/i })).toBeDisabled();
  await expect(picker(page,"E").getByRole("button",{ name: /Nhập chữ Ê$|Enter letter Ê$/i })).toBeEnabled();
  await picker(page,"E").getByRole("button",{ name: /Nhập chữ È$|Enter letter È$/i }).click();
  await keyboard(page).getByRole("button",{ name: /^O,/ }).click();
  await expect(input(page)).toHaveValue("MÈO"); await submit(page).click();
  await expect(page.getByRole("region",{ name: /Kết quả ván chơi|Round result/i })).toContainText("Chúc mừng!");
});

test("typing, paste and virtual keys share sequential correction and duplicate-event guards",async ({ page }) => {
  const control = await dictionary(page);
  const payload = control.row.public_payload; payload.levels[3].guesses.push("MMM"); payload.levels[3].guesses.sort(); control.row = playerReleaseRow(payload);
  await start(page);
  await input(page).pressSequentially("m");
  await keyboard(page).getByRole("button",{ name: "E", exact: true }).click();
  await input(page).press("Backspace"); await expect(input(page)).toHaveValue("m");
  await input(page).evaluate(element => { if (!(element instanceof HTMLInputElement)) throw new Error("Expected input"); element.setSelectionRange(0,0); });
  await input(page).pressSequentially("m"); await expect(input(page)).toHaveValue("mm");
  await input(page).press("Backspace"); await paste(page,"mm"); await expect(input(page)).toHaveValue("mmm");
  await input(page).evaluate(element => {
    element.dispatchEvent(new KeyboardEvent("keydown",{ key: "Enter", bubbles: true }));
    element.dispatchEvent(new KeyboardEvent("keydown",{ key: "Enter", repeat: true, bubbles: true }));
    const button = Array.from(document.querySelectorAll("button")).find(candidate => candidate.textContent?.trim() === "Gửi đáp án"); if (!button) throw new Error("Missing submit"); button.click();
  });
  await expect(board(page).locator("[data-feedback]")).toHaveCount(3);
  await expect(keyboard(page).getByRole("button",{ name: /^M,/ })).toBeEnabled();
  await expect(input(page)).toHaveValue("");
  await keyboard(page).getByRole("button",{ name: /^M,/ }).click(); await expect(input(page)).toHaveValue("M");
  await expect(submit(page)).toBeDisabled();
});

test("provisional IME letters are not rejected; modifiers and unrelated dialogs do not submit",async ({ page }) => {
  await dictionary(page); await start(page);
  await input(page).fill("meo"); await submit(page).click();
  await input(page).dispatchEvent("compositionstart"); await input(page).fill("me");
  await expect(input(page)).toHaveValue("me"); await expect(submit(page)).toBeDisabled();
  await input(page).fill("me\u0300o");
  await input(page).dispatchEvent("keydown",{ key: "Enter", isComposing: true, keyCode: 229 });
  await input(page).dispatchEvent("compositionend",{ data: "mèo" });
  await input(page).dispatchEvent("keyup",{ key: "Enter" });
  await expect(submit(page)).toBeEnabled(); await expect(board(page).locator("[data-feedback]")).toHaveCount(3);
  await input(page).press("Control+Enter"); await expect(board(page).locator("[data-feedback]")).toHaveCount(3);
  await page.getByRole("button",{ name: "Cách chơi", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(/dấu|accent/i);
  await page.getByRole("button",{ name: /Đóng hướng dẫn|Close help/i }).focus();
  await page.keyboard.press("Enter"); await expect(board(page).locator("[data-feedback]")).toHaveCount(3);
  await expect(page.getByRole("button",{ name: "Cách chơi", exact: true })).toBeFocused();
  await input(page).focus(); await input(page).press("Enter");
  await expect(page.getByRole("region",{ name: /Kết quả ván chơi|Round result/i })).toContainText("Chúc mừng!");
});

test("known-present ordinary and variant keys keep readable feedback while hovered",async ({ page }) => {
  const control = await dictionary(page);
  const payload = control.row.public_payload; payload.levels[3].guesses.push("ÈOM"); payload.levels[3].guesses.sort(); control.row = playerReleaseRow(payload);
  await start(page); await input(page).fill("ÈOM"); await submit(page).click();
  const ordinary = keyboard(page).getByRole("button",{ name: /^M,/ });
  await expect(ordinary).toHaveCSS("transition-duration","0s");
  await ordinary.hover(); expect(await textContrast(ordinary)).toBeGreaterThanOrEqual(4.5);
  await expansion(page,"E").click();
  const variant = picker(page,"E").getByRole("button",{ name: /Nhập chữ È,|Enter letter È,/i });
  await variant.hover(); expect(await textContrast(variant)).toBeGreaterThanOrEqual(4.5);
});

for (const width of [320,375]) test(`nine-letter input and picker fit ${width}px with reduced motion and a short viewport`,async ({ page }) => {
  await page.setViewportSize({ width, height: 420 }); await page.emulateMedia({ reducedMotion: "reduce" });
  await dictionary(page); await start(page,9);
  await expansion(page,"A").click();
  const dialog = picker(page,"A");
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: `output/playwright/picker-${width}.png`,fullPage: false });
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds) { expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.y).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width); expect(bounds.y + bounds.height).toBeLessThanOrEqual(420); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await dialog.getByRole("button",{ name: /Nhập chữ Ậ$|Enter letter Ậ$/i }).click();
  await expect(input(page)).toBeFocused(); await expect(input(page)).toHaveValue("Ậ");
  await page.screenshot({ path: `output/playwright/input-${width}.png`,fullPage: true });
  await page.getByRole("button",{ name: "Cách chơi", exact: true }).click();
  await expect(page.getByRole("list",{ name: /Chú thích gợi ý|Feedback legend/i })).toContainText("✓");
  await page.getByRole("button",{ name: /Đóng hướng dẫn|Close help/i }).click();
  expect(await page.getByRole("button",{ name: /Xóa chữ cuối|Delete last letter/i }).evaluate(element => getComputedStyle(element).transitionDuration)).toBe("0s");
});
