import { expect, test } from "@playwright/test";

for (const scenario of [
  { name: "desktop", width: 1440, height: 900, reducedMotion: "no-preference" },
  { name: "small phone", width: 375, height: 812, reducedMotion: "reduce" },
  { name: "phone landscape", width: 812, height: 375, reducedMotion: "no-preference" },
] as const) {
  test(`large draw results stay usable on ${scenario.name}`, async ({ page }) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.emulateMedia({ reducedMotion: scenario.reducedMotion });
    await page.addInitScript(() => {
      const config = {
        id: "default", name: "Lucky Draw", ticketRange: { from: 0, to: 239, except: [] },
        prizes: [{ id: "first_prize", name: "First Prize", winners_count: 240, order: 1 }],
      };
      localStorage.setItem("lucky-draw:config:v1", JSON.stringify({ version: 1, config }));
    });
    await page.goto("/lucky-draw");
    await page.getByRole("button", { name: /^(Quay số|Draw)$/i }).click();
    const dialog = page.getByRole("dialog", { name: /Hoàn tất quay|Draw complete/i });
    await expect(dialog).toBeVisible();
    const grid = dialog.getByRole("region", { name: /Mã trúng thưởng|Người trúng|Trúng thưởng|Winners/i });
    const tiles = grid.getByRole("listitem");
    await expect(grid.locator('[aria-posinset="1"]')).toBeVisible();
    expect(await tiles.count()).toBeLessThan(240);
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    const canvas = dialog.locator("canvas");
    if (scenario.reducedMotion === "reduce") {
      await expect(canvas).not.toHaveAttribute("width");
    } else {
      await expect(canvas).toHaveAttribute("width", /^[1-9]\d*$/);
    }
    await grid.focus();
    await grid.press("End");
    await expect(grid.locator('[aria-posinset="240"]')).toBeInViewport();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
}
