import { expect, test } from "@playwright/test";
import { board, dictionary, input, submit } from "./helpers/word-game";

test("setup leads to a compact game and a finished round can select a new length", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await dictionary(page);
  await page.goto("/vua-tieng-viet");
  await expect(board(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Bắt đầu ván" }).click();
  await expect(input(page)).toBeEnabled();
  await expect(page.getByRole("button", { name: /^5 chữ$/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
  await input(page).fill("mèo");
  await submit(page).click();
  await page.getByRole("button", { name: "Cài đặt" }).click();
  await page.getByRole("button", { name: /^5 chữ$/ }).click();
  const dialog = page.getByRole("dialog", { name: "Cài đặt" });
  await expect(dialog.getByText("5 chữ · Từ điển · Cho phép bỏ dấu")).toBeVisible();
  const help = dialog.getByRole("button", { name: "Giải thích độ chính xác" });
  await help.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/hữu co.*hữu cơ/)).toBeVisible();
  await page.keyboard.press("Escape");
  const confirm = dialog.getByRole("button", { name: "Tải ván mới", exact: true });
  const cancel = dialog.getByRole("button", { name: "Hủy", exact: true });
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 667 });
    await expect(confirm).toBeVisible();
    await expect(cancel).toBeVisible();
    expect((await confirm.boundingBox())?.height).toBe((await cancel.boundingBox())?.height);
  }
  await confirm.click();
  await expect(input(page)).toBeEnabled();
  await expect(board(page).getByRole("img")).toHaveCount(30);
});
