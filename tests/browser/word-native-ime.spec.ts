import { test, expect } from "@playwright/test";
import { dictionary, start, input, submit } from "./helpers/word-game";

// Opt-in headed journey: physical/native Windows keys must supply the text.
// Never substitute Playwright typing or synthetic composition for this check.
test.skip(process.env.VTV_NATIVE_IME_SMOKE !== "true","Requires a headed browser and installed Windows Vietnamese input method");
test.use({ channel: "chrome" });
test("native Windows Vietnamese IME smoke",async ({ page }) => {
  test.setTimeout(300000);
  await dictionary(page); await start(page,9);
  await page.evaluate(() => { document.title = "VTV native IME verification"; });
  await input(page).focus();
  await expect.poll(async () => (await input(page).inputValue()).normalize("NFC").toLowerCase().replaceAll(" ",""),{ timeout: 240000 }).toBe("tiếngviệt");
  await expect(submit(page)).toBeEnabled();
  await expect(page.getByRole("region",{ name: /Kết quả ván chơi|Round result/i })).toContainText("Chúc mừng!",{ timeout: 60000 });
  await page.screenshot({ path: "output/playwright/native-ime.png",fullPage: true });
});
