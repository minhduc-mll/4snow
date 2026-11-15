import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

// Privileged fixture mutations are confined to the disposable project name.
function sql(statement: string) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_quiz-verification", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"],
    { input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}
function fixture() {
  const session = randomUUID(), question = randomUUID(), next = randomUUID();
  sql(`insert into public.quiz_sessions(id,title,join_code,status,total_questions) values ('${session}','Browser Quiz','${session}','lobby',2);
    insert into private.quiz_questions(id,session_id,prompt,type,options,correct_option_ids,time_limit_seconds,base_points,order_index) values
    ('${question}','${session}','First safe question','single_choice','[{"id":"a","label":"A","value":"Alpha","secret":"hidden"},{"id":"b","label":"B","value":"Beta"}]',array['a'],300,1000,0),
    ('${next}','${session}','Second safe question','single_choice','[{"id":"a","label":"A","value":"Alpha"},{"id":"b","label":"B","value":"Beta"}]',array['b'],300,1000,1);`);
  return { session, question, next };
}
function activate(session: string, question: string, secondsAgo = 0) {
  sql(`update public.quiz_sessions set status='active',current_question_id='${question}',current_question_started_at=clock_timestamp()-make_interval(secs=>${secondsAgo}) where id='${session}';`);
}
async function join(page: Page, session: string) {
  await page.addInitScript(() => { localStorage.setItem("app:language:v1", "en"); });
  await page.goto(`/quiz?sessionId=${session}&participantId=${randomUUID()}&name=Untrusted`);
  await page.getByLabel(/Display name|Tên hiển thị/).fill("Browser player");
  await page.getByRole("button", { name: /Join quiz|Tham gia câu đố/, exact: true }).click();
  await expect(page.getByText(/Playing as Browser player|Đang chơi với tên Browser player/)).toBeVisible();
}
const submit = (page: Page) => page.getByRole("button", { name: /Submit answer|Gửi đáp án|Trả lời/i });
const retry = (page: Page) => page.getByRole("button", { name: /Retry saved answer|Gửi lại đáp án đã lưu/ });
const receipt = (page: Page) => page.getByText(/Answer received:.*points|Đã nhận đáp án:.*điểm/);

test("real join, safe question, trusted receipt and authoritative leaderboard", async ({ page, context }) => {
  const f = fixture();
  const paths: string[] = [];
  let leaked = false;
  page.on("request", request => { if (request.url().includes("/rest/v1/")) paths.push(new URL(request.url()).pathname); });
  page.on("response", async response => {
    if (!response.url().includes("/rest/v1/quiz_player_questions")) return;
    const body = await response.text().catch(() => "");
    leaked ||= /correct_option_ids|credential|hidden/.test(body);
  });
  await join(page, f.session);
  activate(f.session, f.question);
  await expect(page.getByRole("heading", { name: "First safe question" })).toBeVisible();
  await page.getByRole("button", { name: /A Alpha/ }).click();
  await submit(page).click();
  await expect(receipt(page)).toBeVisible();
  await expect(page.getByRole("button", { name: /B Beta/ })).toBeDisabled();
  const score = sql(`select score from private.quiz_submissions where session_id='${f.session}';`);
  await expect(receipt(page)).toContainText(score);
  expect(sql(`select count(*) from private.quiz_submission_audit a join private.quiz_submissions s on s.id=a.submission_id where s.session_id='${f.session}';`)).toBe("1");
  const ranking = await context.newPage();
  await ranking.goto(`/leaderboard?sessionId=${f.session}`);
  await expect(ranking.getByText("Browser player", { exact: true })).toBeVisible();
  await expect(ranking.getByText(score, { exact: true })).toBeVisible();
  expect(leaked).toBe(false);
  expect(paths.some(path => /\/(quiz_questions|quiz_submissions|participants)$/.test(path))).toBe(false);
  await page.screenshot({ path: "output/playwright/quiz-trusted-receipt.png", fullPage: true });
});

test("lost response freezes the exact attempt and recovers its receipt after host progression", async ({ page }) => {
  const f = fixture();
  let first = true, identical = false;
  let sent: string | null = null;
  await page.route("**/functions/v1/quiz-submit", async route => {
    const input: unknown = route.request().postDataJSON();
    if (typeof input !== "object" || input === null || !("operation" in input) || input.operation !== "submit") return route.continue();
    const text = route.request().postData();
    if (first) {
      first = false; sent = text;
      const result = await route.fetch();
      expect(result.status()).toBe(200);
      await route.abort("failed");
    } else { identical = text === sent; await route.continue(); }
  });
  await join(page, f.session);
  activate(f.session, f.question);
  await page.getByRole("button", { name: /A Alpha/ }).click();
  await submit(page).click();
  await expect(retry(page)).toBeVisible();
  await expect(receipt(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /B Beta/ })).toBeDisabled();
  activate(f.session, f.next);
  await expect(page.getByRole("heading", { name: "Second safe question" })).toBeVisible();
  await retry(page).click();
  await expect(receipt(page)).toBeVisible();
  await expect(receipt(page)).toContainText(/previous question|câu hỏi trước/);
  expect(identical).toBe(true);
  expect(sql(`select count(*) from private.quiz_submissions where session_id='${f.session}' and question_id='${f.question}';`)).toBe("1");
  await page.getByRole("button", { name: /B Beta/ }).click();
  await submit(page).click();
  await expect(page.getByRole("button", { name: /B Beta/ })).toBeDisabled();
  expect(sql(`select count(*) from private.quiz_submissions where session_id='${f.session}';`)).toBe("2");
});

test("an incorrect receipt is final and cannot be submitted twice", async ({ page }) => {
  const f = fixture();
  await join(page, f.session);
  activate(f.session, f.question);
  await page.getByRole("button", { name: /B Beta/ }).click();
  await submit(page).click();
  await expect(receipt(page)).toContainText("0");
  await expect(receipt(page)).toContainText(/Incorrect|Sai/);
  await expect(submit(page)).toBeDisabled();
  await expect(page.getByRole("button", { name: /A Alpha/ })).toBeDisabled();
  expect(sql(`select count(*) from private.quiz_submissions where session_id='${f.session}';`)).toBe("1");
});

test("tampered credentials are denied without showing a receipt", async ({ page }) => {
  const f = fixture();
  await page.route("**/functions/v1/quiz-submit", async route => {
    const input: unknown = route.request().postDataJSON();
    if (typeof input === "object" && input !== null && "operation" in input && input.operation === "submit") {
      return route.continue({ postData: JSON.stringify({ ...input, credential: "0".repeat(64) }) });
    }
    return route.continue();
  });
  await join(page, f.session);
  activate(f.session, f.question);
  await page.getByRole("button", { name: /A Alpha/ }).click();
  await submit(page).click();
  await expect(page.getByRole("alert").filter({ hasText: /invalid or expired|không hợp lệ hoặc đã hết hạn/ })).toBeVisible();
  await expect(receipt(page)).toHaveCount(0);
  await expect(retry(page)).toHaveCount(0);
  expect(sql(`select count(*) from private.quiz_submissions where session_id='${f.session}';`)).toBe("0");
});

test("a manipulated client clock cannot score an expired server question", async ({ page }) => {
  const f = fixture();
  await join(page, f.session);
  await page.evaluate(() => { Date.now = () => 0; });
  activate(f.session, f.question, 301);
  await page.getByRole("button", { name: /A Alpha/ }).click();
  await submit(page).click();
  await expect(page.getByRole("alert").filter({ hasText: /server has closed|Máy chủ đã đóng/ })).toBeVisible();
  await expect(receipt(page)).toHaveCount(0);
  expect(sql(`select count(*) from private.quiz_submissions where session_id='${f.session}';`)).toBe("0");
});

test("a stale visible question is rejected by the trusted endpoint", async ({ page }) => {
  const f = fixture();
  await join(page, f.session);
  activate(f.session, f.question);
  await page.getByRole("button", { name: /A Alpha/ }).click();
  // Model a delayed session refresh while leaving submissions on the real backend.
  const stale = sql(`select row_to_json(s)::text from public.quiz_sessions s where id='${f.session}';`);
  await page.route("**/rest/v1/quiz_sessions?**", route => route.fulfill({ status: 200, contentType: "application/json", body: stale }));
  activate(f.session, f.next);
  await submit(page).click();
  await expect(page.getByRole("alert").filter({ hasText: /no longer active|không còn hoạt động/ })).toBeVisible();
  await expect(receipt(page)).toHaveCount(0);
  expect(sql(`select count(*) from private.quiz_submissions where session_id='${f.session}';`)).toBe("0");
});

test("a room join limit shows a recoverable failure without inventing an identity", async ({ page }) => {
  const f = fixture();
  sql(`insert into private.quiz_rate_limits(bucket,window_started_at,count) values ('join:${f.session}',clock_timestamp(),120);`);
  await page.addInitScript(() => { localStorage.setItem("app:language:v1", "en"); });
  await page.goto(`/quiz?sessionId=${f.session}`);
  await page.getByLabel("Display name").fill("Browser player");
  await page.getByRole("button", { name: "Join quiz", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Too many requests" })).toBeVisible();
  await expect(receipt(page)).toHaveCount(0);
  sql(`delete from private.quiz_rate_limits where bucket='join:${f.session}';`);
  await page.getByRole("button", { name: "Join quiz", exact: true }).click();
  await expect(page.getByText("Playing as Browser player")).toBeVisible();
});

test("navigating away from an uncertain attempt cannot confirm a different session", async ({ page }) => {
  const f = fixture(), other = fixture();
  await page.route("**/functions/v1/quiz-submit", async route => {
    const input: unknown = route.request().postDataJSON();
    if (typeof input === "object" && input !== null && "operation" in input && input.operation === "submit") {
      const result = await route.fetch();
      expect(result.status()).toBe(200);
      await route.abort("failed");
    } else await route.continue();
  });
  await join(page, f.session);
  activate(f.session, f.question);
  await page.getByRole("button", { name: /A Alpha/ }).click();
  await submit(page).click();
  await expect(retry(page)).toBeVisible();
  await page.goto(`/quiz?sessionId=${other.session}&participantId=${randomUUID()}`);
  await expect(page.getByLabel("Display name")).toBeVisible();
  await expect(receipt(page)).toHaveCount(0);
  await expect(retry(page)).toHaveCount(0);
  expect(sql(`select count(*) from private.quiz_submissions where session_id='${f.session}';`)).toBe("1");
  expect(sql(`select count(*) from private.quiz_submissions where session_id='${other.session}';`)).toBe("0");
});

test("the join and receipt remain usable on a narrow reduced-motion viewport", async ({ page }) => {
  const f = fixture();
  await page.setViewportSize({ width: 375, height: 667 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await join(page, f.session);
  activate(f.session, f.question);
  await page.getByRole("button", { name: /A Alpha/ }).click();
  await submit(page).click();
  await expect(receipt(page)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "output/playwright/quiz-mobile-receipt.png", fullPage: true });
});
