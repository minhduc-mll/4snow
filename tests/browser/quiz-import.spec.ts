import { expect, test } from "@playwright/test";

test("quiz import previews questions and row warnings without claiming to save", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("admin-auth-token", "session");
    localStorage.setItem("app:language:v1", "en");
  });
  await page.route("**/api/admin/verify", route => route.fulfill({ json: { valid: true, expiresAt: Date.now() + 60000 } }));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/admin#quiz");
  const input = page.getByLabel("Excel or CSV file");
  await input.setInputFiles({ name: "questions.csv", mimeType: "text/csv", buffer: Buffer.from("question,option_a,option_b,correct\nWhat is 2+2?,3,4,b\n,yes,no,a\n") });
  await expect(page.getByText("Selected file: questions.csv")).toBeVisible();
  await page.getByRole("button", { name: /parse|analyze/i }).click();
  await expect(page.getByText("What is 2+2?", { exact: false })).toBeVisible();
  await expect(page.getByText(/B\. 4 — Correct answer/)).toBeVisible();
  await expect(page.getByText(/Row 3: Add question text/)).toBeVisible();
  await expect(page.getByText(/preview only.*Saving imported questions is not currently supported/i)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await input.setInputFiles({ name: "invalid.csv", mimeType: "text/csv", buffer: Buffer.from("question,option_a,option_b,correct\nOnly one option,one,,a\n") });
  await expect(page.getByText("What is 2+2?", { exact: false })).toHaveCount(0);
  await page.getByRole("button", { name: /parse|analyze/i }).click();
  await expect(page.getByText(/Row 2: Provide at least two options/)).toBeVisible();
  await expect(page.getByText(/No valid questions were found/)).toBeVisible();
});

test("quiz import reports a read failure and allows retry in Vietnamese", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("admin-auth-token", "session");
    localStorage.setItem("app:language:v1", "vi");
    const original = File.prototype.arrayBuffer;
    let fail = true;
    File.prototype.arrayBuffer = function () {
      if (fail) { fail = false; return Promise.reject(new Error("read failed")); }
      return original.call(this);
    };
  });
  await page.route("**/api/admin/verify", route => route.fulfill({ json: { valid: true, expiresAt: Date.now() + 60000 } }));
  await page.goto("/admin#quiz");
  await page.getByLabel("Tệp Excel hoặc CSV").setInputFiles({ name: "questions.csv", mimeType: "text/csv", buffer: Buffer.from("\uFEFFquestion,option_a,option_b,correct\nCâu hỏi?,Có,Không,a\n") });
  const parse = page.getByRole("button", { name: /phân tích/i });
  await parse.click();
  await expect(page.getByRole("alert").filter({ hasText: "Không thể đọc tệp" })).toBeVisible();
  await parse.click();
  await expect(page.getByText("Câu hỏi?", { exact: false })).toBeVisible();
  await expect(page.getByText(/chưa hỗ trợ lưu câu hỏi/)).toBeVisible();
});


