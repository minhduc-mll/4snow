import { test, expect } from "@playwright/test";
import { input, start, dictionary } from "./helpers/word-game";
import { fixtureId, playerPayload, playerReleaseRow } from "../vua-tieng-viet/player-fixture";

test("the opening clue can be toggled without disturbing the round, and is pinned through a new release", async ({ page }) => {
  const remote = await dictionary(page);
  const initial = playerPayload(6);
  initial.levels[3].answers[0].openingClue = "Động vật nuôi";
  remote.row = playerReleaseRow(initial);
  await start(page);
  const clue = page.getByText("Gợi ý đầu ván · Động vật nuôi", { exact: true });
  await expect(clue).toBeVisible();
  await input(page).fill("mè");

  const settings = page.getByRole("button", { name: "Cài đặt", exact: true });
  const toggle = page.getByRole("button", { name: "Hiện gợi ý đầu ván", exact: true });
  await settings.click();
  await toggle.click();
  await page.keyboard.press("Escape");
  await expect(clue).toHaveCount(0);
  await expect(input(page)).toHaveValue("mè");

  const updated = playerPayload(6);
  updated.releaseId = fixtureId(200);
  updated.levels[3].answers[0].openingClue = "Gợi ý từ bản mới";
  remote.row = playerReleaseRow(updated);
  await page.reload();
  await expect(input(page)).toHaveValue("mè");
  await expect(clue).toHaveCount(0);
  await settings.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await page.keyboard.press("Escape");
  await expect(clue).toBeVisible();
  await expect(page.getByText("Gợi ý từ bản mới", { exact: true })).toHaveCount(0);
});

test("an older dictionary without an opening clue uses the full definition", async ({ page }) => {
  await dictionary(page);
  await start(page);
  await expect(page.getByText("Gợi ý đầu ván · Nghĩa tiếng Việt đã duyệt cho mèo.", { exact: true })).toBeVisible();
});
