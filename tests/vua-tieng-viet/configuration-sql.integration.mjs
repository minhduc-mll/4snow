import { execFile, execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import assert from "node:assert/strict";
const database = `vtv_configuration_${randomUUID().replaceAll("-","")}`;
const container = "supabase_db_4snow";
const run = (args,input) => execFileSync("docker",args,{ input,encoding: "utf8" });
const sql = input => run(["exec","-i",container,"psql","-U","postgres","-d",database,"-v","ON_ERROR_STOP=1","-At"],input);
const concurrent = statements => Promise.allSettled(statements.map(statement => promisify(execFile)("docker",["exec",container,"psql","-U","postgres","-d",database,"-v","ON_ERROR_STOP=1","-At","-c",statement],{ encoding: "utf8" })));
const configure = (attempts,revision,key = randomUUID()) => `select public.vtv_configure('${randomUUID()}','${key}','${"a".repeat(64)}','${JSON.stringify({ attemptLimit: attempts,expectedDraftRevision: revision })}');`;
run(["exec",container,"createdb","-U","postgres",database]);
try {
  for (const migration of readdirSync("supabase/migrations").filter(name => name.endsWith(".sql")).sort()) sql(readFileSync(`supabase/migrations/${migration}`,"utf8"));
  sql(readFileSync("tests/supabase/configuration.sql","utf8").replaceAll("-- PUBLICATION_FIXTURE",readFileSync("tests/supabase/publication-fixture.sql","utf8")));
  const edits = await concurrent([configure(1,"0"),configure(12,"0")]);
  assert.equal(edits.filter(result => result.status === "fulfilled").length,1,"Exactly one concurrent edit succeeds");
  assert.ok(edits.some(result => result.status === "rejected" && result.reason.stderr.includes("REVISION_CONFLICT")));
  assert.equal(sql("select count(*) from private.vtv_editorial_events where operation='configuration';").trim(),"1");
  const key = randomUUID(), same = configure(6,"1",key);
  const retries = await concurrent([same,same]);
  assert.equal(retries.filter(result => result.status === "fulfilled").length,2);
  assert.equal(retries[0].value.stdout,retries[1].value.stdout);
  assert.equal(sql("select count(*) from private.vtv_editorial_events where operation='configuration';").trim(),"2");
  // Rights clearance advances the existing draft from revision 2 to 3.
  sql(`begin; ${readFileSync("tests/supabase/publication-fixture.sql","utf8").replaceAll('"expectedDraftRevision":"0"','"expectedDraftRevision":"2"')} commit;`);
  const preview = JSON.parse(sql(`select public.vtv_publication_preview('${randomUUID()}','${randomUUID()}','${"b".repeat(64)}',3);`));
  const race = await concurrent([configure(12,"3"),`select public.vtv_publish('${randomUUID()}','${randomUUID()}','${"c".repeat(64)}','${preview.buildId}',3,null);`]);
  assert.equal(race.filter(result => result.status === "fulfilled").length,1,"Edit/publication share the same draft lock");
  assert.ok(race.some(result => result.status === "rejected" && result.reason.stderr.includes("REVISION_CONFLICT")));
  assert.equal(sql("select revision from private.vtv_draft where id=1;").trim(),"4");
  console.log("PASS configuration SQL and concurrent mutation/publication in disposable local database");
} finally { run(["exec",container,"dropdb","-U","postgres",database]); }
