import { test, expect } from "@playwright/test";
import { dictionary, input, submit, start, board } from "./helpers/word-game";
import { fixtureId, playerPayload, playerReleaseRow } from "../vua-tieng-viet/player-fixture";
import { decodeRoundSave } from "../../lib/vua-tieng-viet/round-save";

for (const mode of ["dictionary","free"] as const) test(`a prepared player shell reloads fully offline in ${mode} mode`, async ({ page, context, baseURL }) => {
  test.skip(!baseURL?.endsWith(":3212"),"Production-only: Next dev waits for its HMR connection while hydrating offline.");
  await dictionary(page); await start(page,3,mode);
  if (mode === "free") {
    await input(page).fill("XYZ");
    await submit(page).click();
  }
  await input(page).fill("mè");
  await expect(page.getByText("Đã sẵn sàng tiếp tục ván khi mất mạng.")).toBeVisible();
  await context.setOffline(true);
  let documentNavigations = 0;
  page.on("request",request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentNavigations++; });
  await page.reload();
  await expect(input(page)).toHaveValue("mè");
  await expect(page.getByText(mode === "free" ? "1 / 6 lượt" : "0 / 6 lượt", { exact: true })).toBeVisible();
  await page.getByRole("button",{ name: "Cài đặt", exact: true }).click();
  const settings = page.getByRole("dialog");
  await settings.getByRole("combobox").selectOption("en");
  await expect(settings.getByRole("heading",{ name: "Settings", exact: true })).toBeVisible();
  await settings.getByRole("combobox").selectOption("vi");
  await settings.getByRole("button",{ name: "Hủy", exact: true }).click();
  await expect(input(page)).toHaveValue("mè");
  await input(page).fill("mèo"); await submit(page).click();
  await expect(page.getByText("Chúc mừng! Bạn đã tìm ra đáp án.")).toBeVisible();
  await expect(page.getByText("Chuỗi hiện tại: 1", { exact: true })).toBeVisible();
  await page.getByRole("button",{ name: "Tiếp tục chơi", exact: true }).click();
  await expect(page.locator("#vtv-message")).toContainText(/Cần kết nối mạng/);
  expect(documentNavigations).toBe(1);
  await page.reload();
  await expect(page.getByText("Đã đoán đúng", { exact: true })).toBeVisible();
  await expect(page.getByText("Chuỗi hiện tại: 1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Tiếp tục chơi", exact: true }).click();
  await expect(page.locator("#vtv-message")).toContainText(/Cần kết nối mạng/);
  await context.setOffline(false);
  await page.getByRole("button", { name: "Thử lại tải ván mới", exact: true }).click();
  await expect(input(page)).toBeEnabled();
  await expect(page.getByText("Chuỗi hiện tại: 1", { exact: true })).toBeVisible();
});

test("offline dictionary recovery restores historical membership, raw input and results; replay still needs online validation", async ({ page }) => {
  const remote = await dictionary(page);
  await start(page, 3, "dictionary", "strict");
  await input(page).fill("MEO"); await submit(page).click();
  await input(page).fill("mè");
  const original = await page.evaluate(() => localStorage.getItem("vtv:round:v1"));
  remote.fail = true;
  // Keep the development app shell reachable; the dictionary and online signal are unavailable.
  await page.addInitScript(() => Object.defineProperty(navigator,"onLine",{ get: () => false }));
  await page.reload();
  await expect(input(page)).toHaveValue("mè");
  await expect(board(page).getByText("E",{ exact: true })).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem("vtv:round:v1"))).toBe(original);
  await input(page).fill("mèo"); await submit(page).click();
  await expect(page.getByText("Chúc mừng! Bạn đã tìm ra đáp án.")).toBeVisible();
  await page.getByRole("button",{ name: "Tiếp tục chơi", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(/Cần kết nối mạng/);
  await page.reload();
  await expect(page.getByText("Đã đoán đúng", { exact: true })).toBeVisible();
});

test("a new publication preserves the active round, settings, streak, and spent hints until the next round", async ({ page }) => {
  const remote = await dictionary(page);
  const original = playerPayload(6);
  original.levels[3].answers[0].openingClue = "Gợi ý đã duyệt từ bản cũ.";
  remote.row = playerReleaseRow(original);
  await start(page, 3, "free", "strict");
  const result = page.getByRole("dialog", { name: "Kết quả ván chơi", exact: true });
  for (let win = 0; win < 3; win++) {
    await input(page).fill("mèo");
    await submit(page).click();
    await result.getByRole("button", { name: "Tiếp tục chơi", exact: true }).click();
  }
  await expect(page.getByText("Gợi ý đã duyệt từ bản cũ.", { exact: false })).toBeVisible();
  const settingsButton = page.getByRole("button", { name: "Cài đặt", exact: true });
  const settings = page.getByRole("dialog", { name: "Cài đặt", exact: true });
  const openingClueToggle = settings.getByRole("button", { name: "Hiện gợi ý đầu ván", exact: true });
  await settingsButton.click();
  await openingClueToggle.click();
  await settings.getByRole("button", { name: "Hủy", exact: true }).click();

  await input(page).fill("MEO");
  await submit(page).click();
  await page.getByRole("button", { name: "Dùng gợi ý, còn 3 lượt", exact: true }).click();
  await page.getByRole("button", { name: "Dùng gợi ý, còn 2 lượt", exact: true }).click();
  const firstRow = board(page).getByRole("listitem", { name: "Hàng 1", exact: true });
  const secondRow = board(page).getByRole("listitem", { name: "Hàng 2", exact: true });
  const locked = secondRow.getByRole("img", { name: "Ô 2: È, Đúng vị trí, Đã khóa bằng gợi ý", exact: true });
  await expect(locked).toHaveAttribute("data-feedback", "correct");
  await input(page).fill("ma");
  await expect(secondRow.getByRole("img", { name: "Ô 3: A", exact: true })).toBeVisible();
  const readSave = () => page.evaluate(() => localStorage.getItem("vtv:round:v1"));
  await expect.poll(async () => decodeRoundSave((await readSave()) ?? "").round.input).toBe("ma");
  const oldSave = await readSave();
  if (!oldSave) throw new Error("Expected a saved round before publication");
  const saved = decodeRoundSave(oldSave);
  expect(saved.round.releaseId).toBe(original.releaseId);
  expect(saved.round.configVersion).toBe(original.configurationId);
  expect(saved.membership).toEqual(original.levels[3].guesses);
  const oldPointerReads = remote.pointers;

  const payload = playerPayload(1);
  payload.releaseId = fixtureId(200); payload.configurationId = fixtureId(201);
  payload.levels[3] = {
    guesses: ["AAA", "ĐẤT"],
    answers: [{
      ...payload.levels[3].answers[0], id: fixtureId(202), original: "đất", normalized: "ĐẤT",
      definitionVi: "Nghĩa mới sau xuất bản.", openingClue: "Gợi ý đã duyệt từ bản mới.",
    }],
  };
  remote.row = playerReleaseRow(payload);
  remote.fail = true;
  await settingsButton.click();
  await settings.getByRole("button", { name: "Tải ván mới", exact: true }).click();
  await expect(page.locator("#vtv-message")).toContainText("Chưa tải được");
  expect(await readSave()).toBe(oldSave);
  remote.fail = false;

  await page.reload();
  await expect(input(page)).toHaveValue("ma");
  await expect(locked).toHaveAttribute("data-feedback", "correct");
  await expect(firstRow.getByRole("img", { name: "Ô 2: E, Sai vị trí hoặc sai dấu", exact: true })).toBeVisible();
  await expect(page.getByText("1 / 6 lượt", { exact: true })).toBeVisible();
  await expect(page.getByText("Chuỗi hiện tại: 3", { exact: true })).toBeVisible();
  await expect(page.getByText("Chuỗi dài nhất: 3", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Dùng gợi ý, còn 1 lượt", exact: true })).toBeEnabled();
  await expect(page.getByText("3 chữ · Dễ · Tự do · Bắt buộc đúng dấu", { exact: true })).toBeVisible();
  await expect(page.getByText("Gợi ý đã duyệt từ bản cũ.", { exact: false })).toHaveCount(0);
  await page.getByRole("button", { name: /^E,.*Có chữ có dấu được gợi ý/ }).press("ArrowUp");
  const variants = page.getByRole("dialog", { name: "Dấu cho E", exact: true });
  await expect(variants.getByRole("button", { name: /Nhập chữ È, Chữ được gợi ý/ })).toHaveAttribute("data-revealed", "true");
  await page.keyboard.press("Escape");
  expect(remote.pointers).toBe(oldPointerReads);
  expect(await readSave()).toBe(oldSave);

  await settingsButton.click();
  await expect(openingClueToggle).toHaveAttribute("aria-pressed", "false");
  await openingClueToggle.click();
  await settings.getByRole("button", { name: "Hủy", exact: true }).click();
  await expect(page.getByText("Gợi ý đã duyệt từ bản cũ.", { exact: false })).toBeVisible();
  await input(page).fill("mo");
  await submit(page).click();
  await expect(result.getByText("Nghĩa tiếng Việt đã duyệt cho mèo.", { exact: true })).toBeVisible();
  await expect(result.getByText("mèo", { exact: true })).toBeVisible();
  await result.getByRole("button", { name: "Tiếp tục chơi", exact: true }).click();

  await expect(input(page)).toBeEnabled();
  await expect(page.getByText("Gợi ý đã duyệt từ bản mới.", { exact: false })).toBeVisible();
  await expect(page.getByText("0 / 1 lượt", { exact: true })).toBeVisible();
  await expect(page.getByText("Chuỗi hiện tại: 4", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Dùng gợi ý, còn 2 lượt", exact: true })).toBeEnabled();
  expect(remote.pointers).toBeGreaterThan(oldPointerReads);
  const next = decodeRoundSave((await readSave()) ?? "");
  expect(next.round.releaseId).toBe(payload.releaseId);
  expect(next.round.configVersion).toBe(payload.configurationId);
  expect(next.membership).toEqual(payload.levels[3].guesses);
  expect(next.answer.original).toBe("đất");
});

test("an incompatible save is replaced only when settings starts a new round", async ({ page }) => {
  await dictionary(page);
  await page.addInitScript(() => {
    localStorage.setItem("vtv:round:v1",'{"schemaVersion":1,"normalizerVersion":"vi-latin-v1"}');
    localStorage.setItem("unrelated","keep");
  });
  await page.goto("/vua-tieng-viet");
  await expect(page.getByRole("status")).toContainText(/phiên bản/);
  expect(await page.evaluate(() => localStorage.getItem("vtv:round:v1"))).toContain("vi-latin-v1");
  await page.getByRole("button",{ name: "Cài đặt", exact: true }).click();
  await page.getByRole("button",{ name: "Tải ván mới", exact: true }).click();
  await expect(input(page)).toBeEnabled();
  expect(await page.evaluate(() => localStorage.getItem("vtv:round:v1"))).toContain("vi-nfc-v2");
  expect(await page.evaluate(() => localStorage.getItem("unrelated"))).toBe("keep");
});

test("quota failure keeps in-memory gameplay with a persistent recovery warning", async ({ page }) => {
  await dictionary(page);
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key: string,value: string) {
      if (key === "vtv:round:v1") throw new DOMException("quota","QuotaExceededError");
      original.call(this,key,value);
    };
  });
  await start(page);
  await expect(page.getByText(/Không thể lưu ván/)).toBeVisible();
  await input(page).fill("mèo"); await submit(page).click();
  await expect(page.getByText("Chúc mừng! Bạn đã tìm ra đáp án.")).toBeVisible();
  await expect(page.getByText(/Không thể lưu ván/)).toBeVisible();
});

test("denied storage access permits in-memory play without hiding the warning", async ({ page }) => {
  await dictionary(page);
  await page.addInitScript(() => {
    Object.defineProperty(window,"localStorage",{ get: () => { throw new DOMException("denied","SecurityError"); } });
  });
  await start(page);
  await input(page).fill("mèo"); await submit(page).click();
  await expect(page.getByText("Chúc mừng! Bạn đã tìm ra đáp án.")).toBeVisible();
  await expect(page.getByText(/Không thể lưu ván/)).toBeVisible();
});

test("selecting a level or failing to load a new round preserves the damaged save and recoverable streak", async ({ page }) => {
  const remote = await dictionary(page);
  await page.goto("/vua-tieng-viet");
  const damaged = JSON.stringify({ schemaVersion: 4, normalizerVersion: "vi-nfc-v2", streak: { current: 11, longest: 21, countable: true } });
  await page.evaluate(value => localStorage.setItem("vtv:round:v1",value), damaged);
  await page.reload();
  await expect(page.getByRole("status")).toContainText(/Bản lưu ván chơi bị lỗi/);
  await page.getByRole("button",{ name: "Cài đặt", exact: true }).click();
  await page.getByRole("button",{ name: "9 chữ", exact: true }).click();
  await page.getByRole("button",{ name: "Hủy", exact: true }).click();
  expect(remote.pointers).toBe(0);
  await expect(page.getByText("Chuỗi hiện tại: 11")).toBeVisible();
  remote.fail = true;
  const play = async () => {
    await page.getByRole("button",{ name: "Cài đặt", exact: true }).click();
    await page.getByRole("button",{ name: "9 chữ", exact: true }).click();
    await page.getByRole("button",{ name: "Tải ván mới", exact: true }).click();
  };
  await play();
  await expect(page.getByRole("status")).toContainText(/Chưa tải được/);
  expect(await page.evaluate(() => localStorage.getItem("vtv:round:v1"))).toBe(damaged);
  remote.fail = false;
  await play();
  await expect(input(page)).toBeEnabled();
  await expect(page.getByText("Chuỗi hiện tại: 0")).toBeVisible();
  await expect(page.getByText("Chuỗi dài nhất: 21")).toBeVisible();
});

test("a streak resumes without stealing focus, spans levels, and resets on loss or replacement", async ({ page }) => {
  await dictionary(page,1); await start(page);
  await input(page).fill("mèo"); await submit(page).click();
  await expect(page.getByText("Chuỗi hiện tại: 1")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Chuỗi hiện tại: 1")).toBeVisible();
  await page.getByRole("button",{ name: "Cài đặt", exact: true }).click();
  await page.getByRole("button",{ name: "5 chữ", exact: true }).click();
  await page.getByRole("button",{ name: "Tải ván mới", exact: true }).click();
  await expect(input(page)).toBeEnabled();
  await page.reload();
  await expect(page.getByRole("status")).toContainText("Đã tiếp tục ván trước.");
  await expect(input(page)).not.toBeFocused();
  await input(page).fill("hoa hồ"); await submit(page).click();
  await expect(page.getByText("Chuỗi hiện tại: 2")).toBeVisible();
  await page.getByRole("button",{ name: "Tiếp tục chơi", exact: true }).click();
  await input(page).fill("AAAAA"); await submit(page).click();
  await expect(page.getByText("Chuỗi hiện tại: 0")).toBeVisible();
  await page.getByRole("button",{ name: "Chơi lại", exact: true }).click();
  await input(page).fill("hoa hồ"); await submit(page).click();
  await expect(page.getByText("Chuỗi hiện tại: 1")).toBeVisible();
  await page.getByRole("button",{ name: "Tiếp tục chơi", exact: true }).click();
  await page.getByRole("button",{ name: "Cài đặt", exact: true }).click();
  await page.getByRole("button",{ name: "7 chữ", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("chuỗi hiện tại sẽ về 0");
  await page.getByRole("button",{ name: "Tải ván mới", exact: true }).click();
  await expect(page.getByText("Chuỗi hiện tại: 0")).toBeVisible();
  await expect(page.getByText("Chuỗi dài nhất: 2")).toBeVisible();
});
