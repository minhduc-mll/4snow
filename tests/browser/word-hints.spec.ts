import { expect, test, type Page } from "@playwright/test";
import { board, dictionary, input, start, submit } from "./helpers/word-game";

const hints = (page: Page, count: number) =>
  page.getByRole("button", { name: `Dùng gợi ý, còn ${count} lượt`, exact: true });

test("wins bank up to three hints; accented reveals and row locks persist without marking the next row", async ({ page }) => {
  await dictionary(page, 3);
  await start(page, 3, "free", "strict");
  await expect(hints(page, 0)).toBeDisabled();
  for (const count of [1, 2, 3, 3]) {
    await input(page).fill("mèo");
    await submit(page).click();
    const result = page.getByRole("dialog", { name: "Kết quả ván chơi" });
    await result.getByRole("button", { name: "Tiếp tục chơi", exact: true }).click();
    await expect(hints(page, count)).toBeEnabled();
  }

  // In strict mode E establishes the base but does not reveal È.
  await input(page).fill("MEO");
  await submit(page).click();
  await input(page).fill("MX");
  await page.evaluate(() => new Promise<void>(acquired => {
    void navigator.locks.request("vtv:round:v1", () => new Promise<void>(release => {
      window.addEventListener("release-test-hint-lock", () => release(), { once: true });
      acquired();
    }));
  }));
  const pendingHint = hints(page, 3);
  try {
    await pendingHint.click();
    await expect(pendingHint).toBeDisabled();
    await expect(input(page)).toBeDisabled();
    await expect(submit(page)).toBeDisabled();
    await expect(page.locator("#vtv-message")).toHaveText("Đang lưu gợi ý…");
    await pendingHint.dispatchEvent("click");
  } finally {
    await page.evaluate(() => window.dispatchEvent(new Event("release-test-hint-lock")));
  }
  await expect(hints(page, 2)).toBeEnabled();
  await expect(input(page)).toHaveValue("MX");
  const base = page.getByRole("button", { name: /^E,.*Có chữ có dấu được gợi ý/ });
  await base.press("ArrowUp");
  const choices = page.getByRole("dialog", { name: "Dấu cho E" });
  await expect(choices.getByRole("button", { name: /Nhập chữ È, Chữ được gợi ý/ })).toHaveAttribute("data-revealed", "true");
  await expect(choices.getByRole("button", { name: /^Nhập chữ E,/ })).not.toHaveAttribute("data-revealed");
  await page.keyboard.press("Escape");

  await hints(page, 2).click();
  await expect(hints(page, 1)).toBeEnabled();
  const locked = board(page).getByRole("img", { name: "Ô 2: È, Đúng vị trí, Đã khóa bằng gợi ý" });
  await expect(locked).toHaveAttribute("data-feedback", "correct");
  await expect(input(page)).toHaveValue("M");
  await expect(input(page)).toBeFocused();
  await page.keyboard.type("a");
  await expect(board(page).getByRole("img", { name: "Ô 3: A", exact: true })).toBeVisible();

  await page.reload();
  await expect(hints(page, 1)).toBeEnabled();
  await expect(locked).toBeVisible();
  await expect(input(page)).toHaveValue("Ma");
  await page.getByRole("button", { name: "Xóa chữ cuối" }).click();
  await expect(input(page)).toHaveValue("M");
  await input(page).evaluate(element => {
    const data = new DataTransfer();
    data.setData("text/plain", "A");
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
  });
  await expect(input(page)).toHaveValue("MA");
  await expect(locked).toBeVisible();
  await submit(page).click();

  const nextRow = board(page).getByRole("listitem", { name: "Hàng 3" });
  await expect(nextRow.getByRole("img", { name: "Ô 2: trống" })).toBeVisible();
  await expect(locked).toBeVisible();
  await input(page).fill("AAA");
  await submit(page).click();
  const result = page.getByRole("dialog", { name: "Kết quả ván chơi" });
  await result.getByRole("button", { name: "Chơi lại", exact: true }).click();
  await expect(hints(page, 1)).toBeEnabled();
  await expect(page.getByText("Chuỗi hiện tại: 0")).toBeVisible();
});
