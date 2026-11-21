import { expect, test } from "@playwright/test";
import { input, dictionary, submit } from "./helpers/word-game";

const game = "/vua-tieng-viet";
const catalog = `${game}/tu-vung`;
const tsv = "/tu-vung/tu-tieng-viet-tong-hop.tsv";

test("Tra từ returns to the active or completed round without losing progress", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await dictionary(page);
  await page.goto(game);
  const lookup = page.getByRole("link", { name: "Tra từ", exact: true });
  await expect(lookup).toBeVisible();
  await page.getByRole("button", { name: "Cài đặt", exact: true }).click();
  await page.getByRole("button", { name: "Bắt buộc đúng dấu", exact: true }).click();
  await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
  await page.getByRole("button", { name: "Bắt đầu ván", exact: true }).click();
  await input(page).fill("meo");
  await submit(page).click();
  await input(page).fill("mè");
  await lookup.focus();
  await lookup.press("Enter");
  await expect(page.getByRole("heading", { name: "Danh mục từ vựng" })).toBeFocused();
  await page.goBack();
  await expect(input(page)).toHaveValue("mè");
  await expect(page.getByText("1 / 6 lượt", { exact: true })).toBeVisible();
  await expect(lookup).toBeFocused();
  await input(page).fill("mèo");
  await submit(page).click();
  await expect(page.getByRole("region", { name: "Kết quả ván chơi" })).toContainText("2 / 6 lượt");
  await lookup.click();
  await page.getByRole("link", { name: "Về Vua Tiếng Việt" }).click();
  await expect(page.getByRole("region", { name: "Kết quả ván chơi" })).toContainText("2 / 6 lượt");
  await expect(page.getByText("Chuỗi hiện tại: 1", { exact: true })).toBeVisible();
  await expect(lookup).toBeFocused();
});

test("catalog retries, ranks exact spelling first, and brings pagination back to the results", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  let unavailable = true;
  const entries = ["hưu co", "hữu cơ", "đá", "da", ...Array.from({ length: 41 }, (_, index) => `mục ${index}`)];
  await page.route(`**${tsv}`, route => unavailable ? route.fulfill({ status: 503 }) : route.fulfill({
    contentType: "text/tab-separated-values; charset=utf-8",
    body: ["tu\tkaikki_viwiktionary\tho_ngoc_duc", ...entries.map(entry => `${entry}\t1\t1`)].join("\n"),
  }));
  await page.goto(catalog);
  const status = page.getByRole("status");
  const rows = page.getByRole("cell").filter({ hasNot: page.getByRole("link") });
  await expect(status).toHaveText("Chưa tải được danh mục.");
  unavailable = false;
  await page.getByRole("button", { name: "Tải lại danh mục" }).click();
  await expect(status).toHaveText("Mục 1–40 / 45 · Trang 1 / 2");
  const next = page.getByRole("navigation", { name: "Phân trang cuối danh sách" }).getByRole("button", { name: "Trang sau" });
  expect((await next.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await next.click();
  await expect(status).toHaveText("Mục 41–45 / 45 · Trang 2 / 2");
  await expect(page.getByRole("heading", { name: "Kết quả tra từ" })).toBeFocused();
  await expect(page.getByRole("heading", { name: "Kết quả tra từ" })).toBeInViewport();
  const search = page.getByRole("searchbox");
  await search.fill("HỮU CƠ".normalize("NFD"));
  await expect(rows).toHaveText(["hữu cơ", "hưu co"]);
  await search.fill("huu co");
  await expect(rows).toHaveText(["hưu co", "hữu cơ"]);
  await search.fill("DA");
  await expect(rows).toHaveText(["da", "đá"]);
  await search.fill("zzzzqqqq");
  await expect(status).toHaveText("Không tìm thấy cách viết phù hợp.");
  await search.clear();
  await expect(status).toHaveText("Mục 1–40 / 45 · Trang 1 / 2");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await expect(page.getByRole("link", { name: "Ghi công và điều khoản sử dụng" })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Tải danh mục TSV" }).click();
  expect((await download).suggestedFilename()).toBe("tu-tieng-viet-tong-hop.tsv");
});
