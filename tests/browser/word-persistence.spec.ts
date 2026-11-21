import { test, expect } from "@playwright/test";
import { dictionary, input, submit, start, board } from "./helpers/word-game";

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
  await page.getByRole("button",{ name: "Chơi lại", exact: true }).click();
  await expect(page.locator("#vtv-message")).toContainText(/Cần kết nối mạng/);
  expect(documentNavigations).toBe(1);
  await page.reload();
  await expect(page.getByText("Chúc mừng! Bạn đã tìm ra đáp án.")).toBeVisible();
  await expect(page.getByText("Chuỗi hiện tại: 1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Chơi lại", exact: true }).click();
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
  await page.getByRole("button",{ name: "Chơi lại", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(/Cần kết nối mạng/);
  await page.reload();
  await expect(page.getByText("Chúc mừng! Bạn đã tìm ra đáp án.")).toBeVisible();
});

test("publication changes cannot replace the saved answer or configuration; replay loads the new release", async ({ page }) => {
  const remote = await dictionary(page,6);
  await start(page);
  await input(page).fill("M");
  const old = await page.evaluate(() => localStorage.getItem("vtv:round:v1"));
  const { playerPayload, playerReleaseRow, fixtureId } = await import("../vua-tieng-viet/player-fixture");
  const payload = playerPayload(1);
  payload.releaseId = fixtureId(200); payload.configurationId = fixtureId(201);
  payload.levels[3].answers[0].definitionVi = "Nghĩa mới sau xuất bản.";
  remote.row = playerReleaseRow(payload);
  await page.reload();
  await expect(input(page)).toHaveValue("M");
  expect(await page.evaluate(() => localStorage.getItem("vtv:round:v1"))).toBe(old);
  await input(page).fill("mèo"); await submit(page).click();
  await expect(page.getByText("Nghĩa tiếng Việt đã duyệt cho mèo.")).toBeVisible();
  await page.getByRole("button",{ name: "Chơi lại", exact: true }).click();
  await expect(input(page)).toBeEnabled();
  await input(page).fill("AAA"); await submit(page).click();
  await expect(page.getByText("Nghĩa mới sau xuất bản.")).toBeVisible();
});

test("an incompatible save is replaced only when one-click recovery starts a new round", async ({ page }) => {
  await dictionary(page);
  await page.addInitScript(() => {
    localStorage.setItem("vtv:round:v1",'{"schemaVersion":1,"normalizerVersion":"vi-latin-v1"}');
    localStorage.setItem("unrelated","keep");
  });
  await page.goto("/vua-tieng-viet");
  await expect(page.getByRole("status")).toContainText(/phiên bản/);
  expect(await page.evaluate(() => localStorage.getItem("vtv:round:v1"))).toContain("vi-latin-v1");
  await page.getByRole("button",{ name: "Chơi ván mới", exact: true }).click();
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
  await page.getByRole("button",{ name: "Áp dụng", exact: true }).click();
  expect(remote.pointers).toBe(0);
  await expect(page.getByText("Chuỗi hiện tại: 11")).toBeVisible();
  remote.fail = true;
  const play = page.getByRole("button",{ name: "Chơi ván mới", exact: true });
  await play.click();
  await expect(page.getByRole("status")).toContainText(/Chưa tải được/);
  expect(await page.evaluate(() => localStorage.getItem("vtv:round:v1"))).toBe(damaged);
  remote.fail = false;
  await play.click();
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
  await page.getByRole("button",{ name: "Chơi lại", exact: true }).click();
  await input(page).fill("AAAAA"); await submit(page).click();
  await expect(page.getByText("Chuỗi hiện tại: 0")).toBeVisible();
  await page.getByRole("button",{ name: "Chơi lại", exact: true }).click();
  await input(page).fill("hoa hồ"); await submit(page).click();
  await expect(page.getByText("Chuỗi hiện tại: 1")).toBeVisible();
  await page.getByRole("button",{ name: "Chơi lại", exact: true }).click();
  await page.getByRole("button",{ name: "Chơi ván mới", exact: true }).click();
  await page.getByRole("button",{ name: "7 chữ", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("chuỗi hiện tại sẽ về 0");
  await page.getByRole("button",{ name: "Tải ván mới", exact: true }).click();
  await expect(page.getByText("Chuỗi hiện tại: 0")).toBeVisible();
  await expect(page.getByText("Chuỗi dài nhất: 2")).toBeVisible();
});
