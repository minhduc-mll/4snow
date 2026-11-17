import { test, expect } from "@playwright/test";
import { dictionary, input, submit, start, board } from "./helpers/word-game";

test("a prepared player shell reloads fully offline with its saved round", async ({ page, context, baseURL }) => {
  test.skip(!baseURL?.endsWith(":3212"),"Production-only: Next dev waits for its HMR connection while hydrating offline.");
  await dictionary(page); await start(page);
  await input(page).fill("mè");
  await expect(page.getByText("Đã sẵn sàng tiếp tục ván khi mất mạng.")).toBeVisible();
  await context.setOffline(true);
  let documentNavigations = 0;
  page.on("request",request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentNavigations++; });
  await page.reload();
  await expect(input(page)).toHaveValue("mè");
  await page.getByRole("button",{ name: "Cách chơi", exact: true }).click();
  await page.getByRole("combobox").selectOption("en");
  await expect(page.getByText(/E, Ê and Ế are different/)).toBeVisible();
  await page.getByRole("combobox").selectOption("vi");
  await page.getByRole("button",{ name: /Đóng hướng dẫn|Close help/i }).click();
  await expect(input(page)).toHaveValue("mè");
  await input(page).fill("mèo"); await submit(page).click();
  await expect(page.getByText("Chúc mừng! Bạn đã tìm ra đáp án.")).toBeVisible();
  await page.getByRole("button",{ name: "Chơi lại", exact: true }).click();
  await expect(page.locator("#vtv-message")).toContainText(/Cần kết nối mạng/);
  expect(documentNavigations).toBe(1);
});

test("offline dictionary recovery restores historical membership, raw input and results; replay still needs online validation", async ({ page }) => {
  const remote = await dictionary(page);
  await start(page);
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

test("unreadable saves stay untouched until explicit feature-only reset", async ({ page }) => {
  await dictionary(page);
  await page.addInitScript(() => {
    localStorage.setItem("vtv:round:v1",'{"schemaVersion":1,"normalizerVersion":"vi-latin-v1"}');
    localStorage.setItem("unrelated","keep");
  });
  await page.goto("/vua-tieng-viet");
  await expect(page.getByRole("status")).toContainText(/phiên bản/);
  await expect(page.getByRole("button",{ name: /Bắt đầu ván/ })).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem("vtv:round:v1"))).toContain("vi-latin-v1");
  await page.getByRole("button",{ name: "Xóa bản lưu và bắt đầu lại", exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("vtv:round:v1"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("unrelated"))).toBe("keep");
  await page.getByRole("button",{ name: /Bắt đầu ván/ }).click();
  await expect(input(page)).toBeEnabled();
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

test("corrupt saves are not overwritten by starting or selecting a level", async ({ page }) => {
  const remote = await dictionary(page);
  await page.goto("/vua-tieng-viet");
  await page.evaluate(() => localStorage.setItem("vtv:round:v1","broken"));
  await page.reload();
  await expect(page.getByRole("status")).toContainText(/Bản lưu ván chơi bị lỗi/);
  await page.getByRole("button",{ name: "9 chữ", exact: true }).click();
  await expect(page.getByRole("button",{ name: /Bắt đầu ván/ })).toBeDisabled();
  expect(remote.pointers).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem("vtv:round:v1"))).toBe("broken");
});
