import { execFile, execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { promisify } from "node:util";
import { canonicalJson } from "../../lib/vua-tieng-viet/dictionary-contract.ts";
import { parseCurrentRelease, validateReleaseRow } from "../../lib/vua-tieng-viet/public-release.ts";
const database = `vtv_publication_${randomUUID().replaceAll("-", "")}`;
const container = "supabase_db_4snow";
const run = (args, input) => execFileSync("docker", args, { input, encoding: "utf8" });
const sql = (input) => run(["exec", "-i", container, "psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-At"], input);
run(["exec", container, "createdb", "-U", "postgres", database]);
try {
  for (const migration of readdirSync("supabase/migrations").filter(name => name.endsWith(".sql")).sort()) sql(readFileSync(`supabase/migrations/${migration}`, "utf8"));
  sql(readFileSync("tests/supabase/publication.sql", "utf8").replaceAll("-- PUBLICATION_FIXTURE", readFileSync("tests/supabase/publication-fixture.sql", "utf8")));
  sql(`begin; ${readFileSync("tests/supabase/publication-fixture.sql", "utf8")} commit;`);
  const preview = JSON.parse(sql(`select public.vtv_publication_preview('${randomUUID()}','${randomUUID()}','${"a".repeat(64)}',1);`));
  const payload = JSON.parse(sql(`select payload from private.vtv_release_builds where id='${preview.buildId}';`));
  assert.equal(preview.contentHash, createHash("sha256").update(canonicalJson(payload)).digest("hex"), "SQL/JS canonical hash parity");
  assert.equal(preview.payloadBytes, Buffer.byteLength(canonicalJson(payload)), "SQL/JS UTF-8 size parity");
  assert.deepEqual(preview.changes[3], { guesses: { added: preview.coverage[3].guesses, removed: 0 }, answers: { added: preview.coverage[3].answers, removed: 0 } });
  for (const role of ["anon", "authenticated"]) {
    assert.equal(sql(`select has_function_privilege('${role}', 'public.vtv_preview_game(uuid,text)', 'execute');`).trim(), "f");
    assert.equal(sql(`select has_function_privilege('${role}', 'public.vtv_publish_confirmed(uuid,uuid,text,uuid,bigint,uuid,text)', 'execute');`).trim(), "f");
  }
  assert.equal(sql("select has_function_privilege('service_role', 'public.vtv_publish(uuid,uuid,text,uuid,bigint,uuid)', 'execute');").trim(), "f");
  const game = JSON.parse(sql(`select public.vtv_preview_game('${preview.buildId}','${preview.contentHash}');`));
  assert.deepEqual((await validateReleaseRow([game],game.id)).payload,payload);
  assert.equal(sql("select count(*) from public.vtv_current_release;").trim(), "0", "Preview play keeps public pointer untouched");
  assert.throws(() => sql(`select public.vtv_publish_confirmed('${randomUUID()}','${randomUUID()}','${"b".repeat(64)}','${preview.buildId}',1,null,'${"c".repeat(64)}');`), /REVISION_CONFLICT/);
  const concurrent = await Promise.allSettled([1,2].map(() => promisify(execFile)("docker", ["exec", container, "psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-At", "-c", `select public.vtv_publish_confirmed('${randomUUID()}','${randomUUID()}','${"b".repeat(64)}','${preview.buildId}',1,null,'${preview.contentHash}');`], { encoding: "utf8" })));
  assert.equal(concurrent.filter(result => result.status === "fulfilled").length, 1, "Exactly one concurrent publisher succeeds");
  const failed = concurrent.find(result => result.status === "rejected");
  assert.ok(failed && failed.reason.stderr.includes("REVISION_CONFLICT"));
  assert.equal(sql("select count(*) from public.vtv_releases;").trim(), "1");
  assert.equal(sql("select count(*) from private.vtv_editorial_events where operation='publish';").trim(), "1");
  const publicPointer = parseCurrentRelease(JSON.parse(sql("set role anon; select json_agg(json_build_object('release_id',release_id,'pointer_revision',pointer_revision::text)) from public.vtv_current_release;").replace(/^SET\s*/,"")));
  const publicRows = JSON.parse(sql("set role anon; select json_agg(r) from public.vtv_releases r;").replace(/^SET\s*/,""));
  const playable = await validateReleaseRow(publicRows,publicPointer.releaseId);
  assert.equal(playable.payload.levels[9].answers[0].normalized,"TIẾNGVIỆT");
  const revisionAfterPublish = sql("select revision from private.vtv_draft where id=1;").trim();
  const nextBuild = JSON.parse(sql(`select public.vtv_publication_preview('${randomUUID()}','${randomUUID()}','${"a".repeat(64)}',${revisionAfterPublish});`));
  assert.equal(nextBuild.expectedCurrentReleaseId, publicPointer.releaseId);
  assert.deepEqual(nextBuild.changes[3], { guesses: { added: 0, removed: 0 }, answers: { added: 0, removed: 0 } });
  console.log("PASS publication SQL in disposable local database");
} finally { run(["exec", container, "dropdb", "-U", "postgres", database]); }
