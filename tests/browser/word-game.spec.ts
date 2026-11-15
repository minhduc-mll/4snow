import { test, expect } from "@playwright/test";
import { fixtureId, playerPayload, playerReleaseRow } from "../vua-tieng-viet/player-fixture";
import type { WordLevel } from "../../types/vua-tieng-viet";
import { dictionary, start, input, board, submit } from "./helpers/word-game";

test("help explains repeated-letter feedback on request", async ({ page }) => {
  await dictionary(page);
  await page.goto("/vua-tieng-viet");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const help = page.getByRole("button", { name: "Cách chơi", exact: true });
  await help.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("AABBC");
  await expect(dialog).toContainText("BABAA");
  await expect(dialog).toContainText("B ↔, A ✓, B ✓, A ↔, A ×");
  await page.getByRole("button", { name: /Đóng hướng dẫn|Close help/i }).click();
  await expect(help).toBeFocused();
});

test("published play preserves invalid guesses, defers IME, pins old rules and replays the latest release", async ({ page }) => {
  const control = await dictionary(page);
  await start(page);
  expect(control.pointers).toBe(2);
  await expect(board(page).getByRole("listitem")).toHaveCount(6);
  await input(page).fill("mè");
  await expect(submit(page)).toBeDisabled();
  await input(page).press("Enter");
  await expect(board(page).locator("[data-feedback]")).toHaveCount(0);
  await input(page).fill("XYZ");
  await submit(page).click();
  await expect(page.getByRole("status")).toContainText(/chưa có trong từ điển|not in the published dictionary/i);
  await expect(input(page)).toHaveValue("XYZ");
  await expect(board(page).locator("[data-feedback]")).toHaveCount(0);
  await input(page).fill("meo");
  await expect(input(page)).toHaveValue("meo");
  await submit(page).click();
  await expect(board(page).locator("[data-feedback]")).toHaveCount(3);
  await expect(input(page)).toHaveValue("");
  const next = playerPayload(1); next.releaseId = fixtureId(99); next.configurationId = fixtureId(98);
  next.levels[3] = { guesses: ["AAA","ĐẤT"], answers: [{ ...next.levels[3].answers[0], id: fixtureId(33), original: "đất", normalized: "ĐẤT", definitionVi: "Nghĩa mới sau xuất bản." }] };
  control.row = playerReleaseRow(next);
  await input(page).dispatchEvent("compositionstart");
  await input(page).fill("me\u0300o");
  await expect(submit(page)).toBeDisabled();
  await input(page).dispatchEvent("keydown",{ key: "Enter", isComposing: true, keyCode: 229 });
  await expect(board(page).locator("[data-feedback]")).toHaveCount(3);
  await input(page).dispatchEvent("compositionend",{ data: "mèo" });
  await input(page).dispatchEvent("keyup",{ key: "Enter" });
  await expect(board(page).locator("[data-feedback]")).toHaveCount(3);
  await submit(page).click();
  const result = page.getByRole("region",{ name: /Kết quả ván chơi|Round result/i });
  await expect(result).toContainText("Chúc mừng!");
  await expect(result).toContainText("Nghĩa tiếng Việt đã duyệt cho mèo.");
  await expect(result).toContainText("Synthetic credit");
  await expect(result).toContainText(/2 \/ 6/);
  await expect(input(page)).toHaveCount(0);
  await expect(board(page).getByRole("listitem")).toHaveCount(6);
  await page.getByRole("button",{ name: "Chơi lại", exact: true }).click();
  await expect(input(page)).toBeEnabled();
  await expect(board(page).getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("status")).toContainText(/chỉ có một đáp án|only one eligible answer/i);
  await input(page).fill("đất"); await submit(page).click();
  await expect(result).toContainText("Nghĩa mới sau xuất bản.");
});

test("one deliberate Enter submits after composition is committed without Enter",async ({ page }) => {
  await dictionary(page);
  await start(page);
  await input(page).dispatchEvent("compositionstart");
  await input(page).fill("me\u0300o");
  await expect(submit(page)).toBeDisabled();
  await input(page).dispatchEvent("compositionend",{ data: "mèo" });
  await expect(submit(page)).toBeEnabled();
  await input(page).press("Enter");
  await expect(page.getByRole("region",{ name: /Kết quả ván chơi|Round result/i })).toContainText("Chúc mừng!");
  await expect(board(page).locator("[data-feedback]")).toHaveCount(3);
});

for (const [level,limit] of [[3,1],[5,6],[7,12],[9,6]] satisfies [WordLevel,number][]) test(`level ${level} uses ${limit} configured rows and renders an inline win`,async ({ page }) => {
  const control = await dictionary(page,limit);
  if (level === 9) await page.setViewportSize({ width: 320, height: 900 });
  await start(page,level);
  await expect(board(page).getByRole("listitem")).toHaveCount(limit);
  await expect(board(page).getByRole("img")).toHaveCount(level * limit);
  if (level === 9) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: "output/playwright/player-320.png", fullPage: true });
  }
  await input(page).fill(control.row.public_payload.levels[level].answers[0].original);
  await input(page).press("Enter");
  await expect(page.getByRole("region",{ name: /Kết quả ván chơi|Round result/i })).toContainText("Chúc mừng!");
  await expect(input(page)).toHaveCount(0);
});

test("level replacement confirms, restores cancellation focus and preserves a round after load/random failures",async ({ page }) => {
  const control = await dictionary(page);
  await start(page);
  await input(page).fill("m");
  const five = page.getByRole("button",{ name: /^5 (chữ|letters)$/ });
  await five.click();
  await page.getByRole("button",{ name: /Tiếp tục chơi|Keep playing/i }).click();
  await expect(five).toBeFocused(); await expect(input(page)).toHaveValue("m");
  await five.click(); control.fail = true;
  await page.getByRole("button",{ name: /Tải ván mới|Load new round/i }).click();
  await expect(page.getByRole("status")).toContainText(/Chưa tải được|Could not load/i);
  await expect(input(page)).toHaveValue("m");
  await expect(page.getByRole("button",{ name: /^3 (chữ|letters)$/ })).toHaveAttribute("aria-pressed","true");
  control.fail = false;
  await page.evaluate(() => { Object.defineProperty(Crypto.prototype,"getRandomValues",{ configurable: true, value: () => { throw new Error("test random unavailable"); } }); });
  await five.click(); await page.getByRole("button",{ name: /Tải ván mới|Load new round/i }).click();
  await expect(page.getByRole("status")).toContainText(/an toàn|safely select/i);
  await expect(input(page)).toHaveValue("m");
  await page.getByRole("button",{ name: "Cách chơi", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("E, Ê");
  await page.getByRole("button",{ name: /Đóng hướng dẫn|Close help/i }).click();
  await expect(page.getByRole("button",{ name: "Cách chơi", exact: true })).toBeFocused();
});

test("missing/malformed releases recover, loss locks the board and offline replay cannot use cached data",async ({ page, context }) => {
  const control = await dictionary(page,1); control.absent = true;
  await page.goto("/vua-tieng-viet");
  const startButton = page.getByRole("button",{ name: /Bắt đầu ván|Start round/i });
  await startButton.click(); await expect(page.getByRole("status")).toContainText(/Chưa có từ điển|No dictionary/i);
  control.absent = false; control.corrupt = true;
  await startButton.click(); await expect(page.getByRole("status")).toContainText(/không hợp lệ|malformed/i);
  control.corrupt = false;
  await startButton.click(); await expect(input(page)).toBeEnabled();
  await input(page).fill("meo"); await submit(page).click();
  const result = page.getByRole("region",{ name: /Kết quả ván chơi|Round result/i });
  await expect(result).toContainText(/Đã hết lượt|Round complete/i);
  await expect(result).toContainText("mèo"); await expect(input(page)).toHaveCount(0);
  await context.setOffline(true);
  await page.getByRole("button",{ name: "Chơi lại", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(/Cần kết nối mạng|online connection/i);
  await expect(result).toBeVisible();
});

test("pointer is rechecked before play and the home card leaves other routes independent",async ({ page }) => {
  const control = await dictionary(page);
  control.onPointer = () => { if (control.pointers === 2) { const next = playerPayload(12); next.releaseId = fixtureId(99); control.row = playerReleaseRow(next); } };
  await page.goto("/");
  const homeCard = page.locator("[data-slot=card]").filter({ has: page.getByText("Vua tiếng Việt",{ exact: true }) });
  await homeCard.getByRole("link").click();
  await page.getByRole("button",{ name: /Bắt đầu ván|Start round/i }).click();
  await expect(input(page)).toBeEnabled();
  expect(control.pointers).toBe(4);
  await expect(board(page).getByRole("listitem")).toHaveCount(12);
  await page.goto("/quiz");
  await expect(page.getByRole("heading",{ name: "Vua tiếng Việt" })).toHaveCount(0);
  await page.goto("/lucky-draw");
  await expect(page.getByRole("heading",{ name: "Vua tiếng Việt" })).toHaveCount(0);
});

test("rapid Enter accepts once and replay selects a different eligible answer",async ({ page }) => {
  const control = await dictionary(page);
  const payload = playerPayload();
  payload.levels[3].answers.push({ ...payload.levels[3].answers[0], id: fixtureId(34), original: "sôi", normalized: "SÔI", definitionVi: "Nghĩa khác đã duyệt." });
  control.row = playerReleaseRow(payload);
  await page.addInitScript(() => { Object.defineProperty(Crypto.prototype,"getRandomValues",{ configurable: true, value: (array: Uint32Array) => { array.fill(0); return array; } }); });
  await start(page);
  await input(page).fill("mèo");
  await input(page).evaluate(element => { for (let i=0;i<2;i++) element.dispatchEvent(new KeyboardEvent("keydown",{ key: "Enter", bubbles: true })); });
  const result = page.getByRole("region",{ name: /Kết quả ván chơi|Round result/i });
  await expect(result).toContainText(/1 \/ 6/);
  await expect(board(page).locator("[data-feedback]")).toHaveCount(3);
  await page.getByRole("button",{ name: "Chơi lại", exact: true }).click();
  await expect(input(page)).toBeEnabled();
  await input(page).fill("sôi"); await submit(page).click();
  await expect(result).toContainText("Nghĩa khác đã duyệt.");
  await expect(result).not.toContainText("Nghĩa tiếng Việt đã duyệt cho mèo.");
});
