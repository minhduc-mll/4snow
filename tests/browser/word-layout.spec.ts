import { expect, test } from "@playwright/test";
import { board, dictionary, input, submit } from "./helpers/word-game";

test("setup leads to a compact game and a finished round can select a new length", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await dictionary(page);
  await page.goto("/vua-tieng-viet");
  await expect(board(page)).toHaveCount(0);
  await page.getByRole("button", { name: /^3 chữ$/ }).click();
  await page.getByRole("button", { name: "Bắt đầu ván" }).click();
  await expect(input(page)).toBeEnabled();
  await expect(page.getByRole("button", { name: /^5 chữ$/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
  await input(page).fill("mèo");
  await submit(page).click();
  await page.getByRole("button", { name: "Chọn số chữ" }).click();
  await page.getByRole("button", { name: /^5 chữ$/ }).click();
  await page.getByRole("button", { name: "Bắt đầu ván" }).click();
  await expect(input(page)).toBeEnabled();
  await expect(board(page).getByRole("img")).toHaveCount(30);
});
