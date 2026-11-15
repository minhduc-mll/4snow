// Destructive fixture operations are restricted to the explicitly named,
// disposable local verification project. Never use this against hosted data.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const cli = process.env.SUPABASE_CLI;
assert.ok(cli, "Set SUPABASE_CLI to the local Supabase executable");
const status = JSON.parse(execFileSync(cli, ["status", "--output", "json", "--workdir", "output/quiz-verification"], { encoding: "utf8" }));
assert.equal(status.API_URL, "http://127.0.0.1:55321");
assert.match(status.DB_URL, /^postgresql:\/\/postgres:[^@]+@127\.0\.0\.1:55322\/postgres$/);
const anon = status.ANON_KEY;
assert.ok(anon);
const base = status.API_URL;
const headers = { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" };
function sql(statement) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_quiz-verification", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"],
    { input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}
async function post(body, expected) {
  const response = await fetch(`${base}/functions/v1/quiz-submit`, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const result = await response.json();
  assert.equal(response.status, expected, `Unexpected status for ${body.operation}`);
  return result;
}
const session = randomUUID();
const otherSession = randomUUID();
const question = randomUUID();
const otherQuestion = randomUUID();
const requestId = randomUUID();
const code = randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase();
const otherCode = randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase();
const request = (credential, overrides = {}) => ({ operation: "submit", sessionId: session, questionId: question, requestId, selectedOptionIds: ["a"], credential, ...overrides });

sql(`delete from private.quiz_rate_limits;
insert into public.quiz_sessions(id,title,join_code,status) values ('${session}','Fixture','${code}','lobby'),('${otherSession}','Other','${otherCode}','lobby');
insert into private.quiz_questions(id,session_id,prompt,type,options,correct_option_ids,time_limit_seconds,base_points,order_index)
values ('${question}','${session}','Fixture question','single_choice','[{"id":"a","label":"A","value":"A","secret":"must-not-leak"},{"id":"b","label":"B","value":"B"}]',array['a'],3600,1000,0),
('${otherQuestion}','${otherSession}','Other question','single_choice','[{"id":"a","label":"A"},{"id":"b","label":"B"}]',array['b'],3600,1000,0);`);

const first = await post({ operation: "join", sessionId: session, displayName: "First" }, 200);
const second = await post({ operation: "join", sessionId: session, displayName: "Second" }, 200);
const third = await post({ operation: "join", sessionId: session, displayName: "Third" }, 200);
const fourth = await post({ operation: "join", sessionId: session, displayName: "Fourth" }, 200);
const fifth = await post({ operation: "join", sessionId: session, displayName: "Fifth" }, 200);
assert.ok(/^[0-9a-f]{64}$/.test(first.credential), "Join credential has the expected format");
assert.ok(first.credential !== second.credential, "Join credentials must differ");
await post({ operation: "join", sessionId: session, displayName: "x".repeat(81) }, 400);
await post(request(first.credential), 409);

const client = createClient(base, anon, { realtime: { params: { eventsPerSecond: 5 } } });
let receiveChange;
const received = new Promise((resolve) => { receiveChange = resolve; });
const channel = client.channel(`quiz-test-${randomUUID()}`).on("postgres_changes", { event: "UPDATE", schema: "public", table: "quiz_sessions", filter: `id=eq.${session}` }, (payload) => receiveChange(payload));
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Realtime subscription timed out")), 15000);
  channel.subscribe((state) => { if (state === "SUBSCRIBED") { clearTimeout(timer); resolve(); } else if (state === "CHANNEL_ERROR") { clearTimeout(timer); reject(new Error("Realtime subscription failed")); } });
});
for (let attempt = 0; attempt < 50; attempt++) {
  if (Number(sql("select count(*) from realtime.subscription where entity = 'public.quiz_sessions'::regclass")) > 0) break;
  if (attempt === 49) throw new Error("Realtime database subscription was not registered");
  await new Promise((resolve) => setTimeout(resolve, 100));
}
sql(`update public.quiz_sessions set status='active', current_question_id='${question}', current_question_started_at=clock_timestamp() where id='${session}';`);
const payload = await Promise.race([received, new Promise((_, reject) => setTimeout(() => reject(new Error("Realtime update timed out")), 15000))]);
assert.equal(payload.new.id, session);
assert.doesNotMatch(JSON.stringify(payload), /correct_option_ids|must-not-leak|credential_hash/);
await client.removeChannel(channel);
client.realtime.disconnect();

const safeResponse = await fetch(`${base}/rest/v1/quiz_player_questions?session_id=eq.${session}&select=*`, { headers });
assert.equal(safeResponse.status, 200);
const safe = await safeResponse.json();
assert.equal(safe.length, 1);
assert.equal(safe[0].id, question);
assert.doesNotMatch(JSON.stringify(safe), /correct_option_ids|must-not-leak/);
const allQuestions = await fetch(`${base}/rest/v1/quiz_player_questions?select=*`, { headers });
assert.equal(allQuestions.status, 200);
assert.ok(!(await allQuestions.json()).some((item) => item.id === otherQuestion));
const privateResponse = await fetch(`${base}/rest/v1/quiz_questions?select=*`, { headers: { ...headers, "Accept-Profile": "private" } });
assert.equal(privateResponse.status, 406);
for (const role of ["anon", "authenticated"]) {
  assert.equal(sql(`select has_table_privilege('${role}', 'private.quiz_questions', 'SELECT') or has_table_privilege('${role}', 'private.quiz_submissions', 'INSERT') or has_function_privilege('${role}', 'public.quiz_submit(uuid,uuid,uuid,text[],text)', 'EXECUTE')`), "f");
}
const forbiddenWrite = await fetch(`${base}/rest/v1/quiz_submissions`, { method: "POST", headers, body: "{}" });
assert.ok([401, 403, 404].includes(forbiddenWrite.status));
const forbiddenRpc = await fetch(`${base}/rest/v1/rpc/quiz_submit`, { method: "POST", headers, body: JSON.stringify({ p_session_id: session, p_question_id: question, p_request_id: requestId, p_selected_option_ids: ["a"], p_credential: first.credential }) });
assert.ok([401, 403].includes(forbiddenRpc.status));
const forbiddenSessionWrite = await fetch(`${base}/rest/v1/quiz_sessions?id=eq.${session}`, { method: "PATCH", headers, body: JSON.stringify({ status: "completed" }) });
assert.ok([401, 403].includes(forbiddenSessionWrite.status));

await post(request("0".repeat(64)), 401);
await post(request(first.credential, { sessionId: otherSession }), 401);
await post(request(first.credential, { questionId: otherQuestion }), 409);
await post(request(first.credential, { selectedOptionIds: ["not-an-option"] }), 400);
await post(request(first.credential, { score: 100000, timeRemainingMs: 3600000 }), 400);
const receipts = await Promise.all([post(request(first.credential), 200), post(request(first.credential), 200)]);
assert.deepEqual(receipts[0], receipts[1]);
assert.deepEqual(receipts[0].selected_option_ids, ["a"]);
assert.equal(receipts[0].is_correct, true);
assert.equal(receipts[0].base_points, 1000);
assert.ok(receipts[0].score > 990 && receipts[0].score <= 1000);
assert.equal(receipts[0].score, Math.round(1000 * receipts[0].time_remaining_ms / 3600000));
assert.doesNotMatch(JSON.stringify(receipts[0]), /question_correct_option_ids|question_options|must-not-leak/);
assert.equal(sql(`select question_correct_option_ids = array['a'] and question_options->0->>'id' = 'a' from private.quiz_submissions where id='${receipts[0].id}'`), "t");
assert.equal(sql(`select count(*) from private.quiz_submissions where participant_id='${first.participantId}'`), "1");
assert.equal(sql(`select count(*) from private.quiz_submission_audit where submission_id='${receipts[0].id}'`), "1");
await post(request(first.credential, { selectedOptionIds: ["b"] }), 409);
await post(request(second.credential), 409);
await post(request(first.credential, { requestId: randomUUID() }), 409);

sql(`create function private.quiz_test_audit_failure() returns trigger language plpgsql as $$ begin raise exception 'test rollback'; end $$;
create trigger quiz_test_failure before insert on private.quiz_submission_audit for each row execute function private.quiz_test_audit_failure();`);
const rollbackRequest = request(second.credential, { requestId: randomUUID(), selectedOptionIds: ["b"] });
try {
  await post(rollbackRequest, 503);
  assert.equal(sql(`select count(*) from private.quiz_submissions where participant_id='${second.participantId}'`), "0");
} finally {
  sql("drop trigger quiz_test_failure on private.quiz_submission_audit; drop function private.quiz_test_audit_failure();");
}
const incorrect = await post(rollbackRequest, 200);
assert.equal(incorrect.is_correct, false);
assert.equal(incorrect.score, 0);
const competing = await Promise.all([randomUUID(), randomUUID()].map((id) =>
  fetch(`${base}/functions/v1/quiz-submit`, { method: "POST", headers, body: JSON.stringify(request(fourth.credential, { requestId: id })) })));
assert.deepEqual(competing.map((response) => response.status).sort(), [200, 409]);
assert.equal((await competing.find((response) => response.status === 409).json()).error, "ALREADY_SUBMITTED");
sql("insert into private.quiz_rate_limits(bucket,window_started_at,count) values ('submit:invalid',clock_timestamp(),600) on conflict (bucket) do update set count=600, window_started_at=clock_timestamp();");
await post(request("0".repeat(64)), 429);
sql(`update public.quiz_sessions set current_question_started_at=clock_timestamp()-interval '30 minutes' where id='${session}';`);
const halfway = await post(request(fifth.credential, { requestId: randomUUID() }), 200);
assert.ok(halfway.time_remaining_ms > 1790000 && halfway.time_remaining_ms <= 1800000);
assert.ok(halfway.score >= 497 && halfway.score <= 500);
assert.equal(sql(`select score from private.quiz_submissions where id='${halfway.id}'`), String(halfway.score));
sql(`update private.quiz_questions set correct_option_ids=array['b'] where id='${question}';`);
assert.equal(sql(`select question_correct_option_ids = array['a'] from private.quiz_submissions where id='${halfway.id}'`), "t");
sql("delete from private.quiz_rate_limits where bucket='submit:invalid';");
sql(`update public.quiz_sessions set current_question_started_at=clock_timestamp()-interval '2 hours' where id='${session}';`);
assert.deepEqual(await post(request(first.credential), 200), receipts[0]);
const expired = await post(request(third.credential, { requestId: randomUUID() }), 409);
assert.equal(expired.error, "QUESTION_EXPIRED");
sql(`update private.quiz_participants set credential_revoked_at=clock_timestamp() where id='${first.participantId}';`);
await post(request(first.credential), 401);
sql(`update private.quiz_participants set credential_expires_at=clock_timestamp()-interval '1 second' where id='${second.participantId}';`);
await post(rollbackRequest, 401);
const leaderboard = await fetch(`${base}/rest/v1/quiz_leaderboard?session_id=eq.${session}&select=*`, { headers });
assert.equal(leaderboard.status, 200);
assert.equal((await leaderboard.json()).length, 5);
sql(`insert into private.quiz_rate_limits(bucket,window_started_at,count) values ('join:${otherSession}',clock_timestamp(),120) on conflict (bucket) do update set count=120, window_started_at=clock_timestamp();`);
await post({ operation: "join", sessionId: otherSession, displayName: "Limited" }, 429);
sql("insert into private.quiz_rate_limits(bucket,window_started_at,count) values ('join:invalid',clock_timestamp(),120) on conflict (bucket) do update set count=120, window_started_at=clock_timestamp();");
await post({ operation: "join", sessionId: randomUUID(), displayName: "Limited" }, 429);
sql(`update private.quiz_rate_limits set count=60, window_started_at=clock_timestamp() where bucket='submit:${third.participantId}';`);
await post(request(third.credential, { requestId: randomUUID() }), 429);
console.log("PASS Quiz local Edge, direct-role access, realtime, retry concurrency, and audit rollback");
