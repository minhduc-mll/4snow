// Run only with the disposable dictionary-verification stack on 127.0.0.1:56321.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const base = "http://127.0.0.1:56321";
const secretsPath = "output/dictionary-verification/supabase/.temp/start-secrets/supabase_edge_runtime_dictionary-verification/env/docker.env";
const env = Object.fromEntries(readFileSync(secretsPath, "utf8").split(/\r?\n/).filter((line) => line.includes("=")).map((line) => {
  const index = line.indexOf("=");
  return [line.slice(0, index), line.slice(index + 1)];
}));
for (const name of ["ADMIN_JWT_SECRET", "SUPABASE_ANON_KEY", "VTV_ALLOWED_ORIGINS"]) assert.ok(env[name], `Missing disposable ${name}`);
const origin = env.VTV_ALLOWED_ORIGINS.split(",")[0].trim();
const now = Math.floor(Date.now() / 1000);
function token(iat, exp) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const payload = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role: "admin", iat, exp })}`;
  return `${payload}.${createHmac("sha256", env.ADMIN_JWT_SECRET).update(payload).digest("base64url")}`;
}

const administrator = token(now, now + 3600);
async function edge(operation, input, status, key, bearer = administrator) {
  const requestId = randomUUID();
  const response = await fetch(`${base}/functions/v1/vtv-dictionary`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${bearer}`, "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ operation, requestId, input, ...(key ? { idempotencyKey: key } : {}) }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json();
  assert.equal(response.status, status, `Unexpected ${operation} status (${body.error?.code ?? "uncategorized"})`);
  if (status !== 401 && status !== 413) assert.equal(body.requestId, requestId);
  return body;
}

function sql(query) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_dictionary-verification", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt"], {
    input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

// Verify the mounted runtime before writing fixture rows to the disposable database.
await edge("bulk-create", {}, 401, undefined, token(now - 120, now - 60));
await edge("bulk-create", {}, 400);
const sourceId = randomUUID();
const importId = randomUUID();
const artifactId = randomUUID();
const draftRevision = sql(`begin;
  do $draft$ begin perform id from private.vtv_draft where id=1 for update; end $draft$;
  insert into private.vtv_sources(id,kind,resource_revision,artifact_sha256,metadata)
    values('${sourceId}','kaikki','${artifactId}',repeat('a',64),'{"name":"Synthetic bulk HTTP verification"}');
  insert into private.vtv_imports(id,artifact_id,artifact_revision,expected_chunks,status,finalized_at)
    values('${importId}','${artifactId}','synthetic',1,'finalized',now());
  insert into private.vtv_entries(id,source_id,external_id,source_entry_id,entry_url,source_payload,import_id,current_revision_id)
    select gen_random_uuid(),'${sourceId}',n::text,n::text,'https://example.invalid/bulk/'||n,'{}','${importId}',gen_random_uuid()
    from generate_series(1,101) n;
  insert into private.vtv_entry_revisions(id,entry_id,revision_number,original,normalized,level,definition_vi,actor_role)
    select current_revision_id,id,1,'mèo','MÈO',3,'Một con vật.','import' from private.vtv_entries where source_id='${sourceId}';
  update private.vtv_draft set revision=revision+1 where id=1 returning revision;
  commit;`);

const rights = { sourceId, expectedDraftRevision: draftRevision, decision: "cleared", evidence: "Synthetic test evidence", obligations: "Synthetic local test only" };
const cleared = await edge("rights-review", rights, 200, randomUUID());
const filters = { sourceId, level: 3, review: "pending", hasDefinition: null, collisionsOnly: false };
const selection = (await edge("bulk-create", { filters, expectedDraftRevision: cleared.data.draftRevision, targets: null }, 200)).data;
assert.equal(selection.count, 101);
assert.equal(selection.items.length, 100);
assert.equal(selection.items[0].answerBlocker, "answer-collision");

const direct = await fetch(`${base}/rest/v1/rpc/vtv_bulk_page`, {
  method: "POST", headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ p_input: { selectionId: selection.selectionId, offset: 0 } }), signal: AbortSignal.timeout(15000),
});
assert.ok([401, 403, 404].includes(direct.status), "Anonymous REST must not expose the frozen selection");

const key = randomUUID();
const targets = (page) => page.items.map(({ entryId, expectedEntryRevision }) => ({ entryId, expectedEntryRevision }));
const batch = {
  selectionId: selection.selectionId, selectionHash: selection.selectionHash, batchId: randomUUID(), offset: 0,
  expectedDraftRevision: selection.draftRevision, targets: targets(selection), category: "common", answerEligible: false,
  rationale: "Reviewed synthetic candidates", exclusionChecks: { names: true, abbreviations: true, offensive: true, malformed: true, unverified: true },
};
await edge("bulk-apply", { ...batch, selectionHash: "0".repeat(64) }, 400, key);
const attempts = await Promise.all([edge("bulk-apply", batch, 200, key), edge("bulk-apply", batch, 200, key)]);
assert.deepEqual(attempts[0].data, attempts[1].data);
assert.equal(attempts[0].data.items.length, 100);
assert.ok(attempts[0].data.items.every(({ status }) => status === "applied"));
const next = (await edge("bulk-page", { selectionId: selection.selectionId, offset: 100 }, 200)).data;
assert.deepEqual(next.totals, { applied: 100, unchanged: 0, invalid: 0, conflict: 0 });
assert.equal(next.items.length, 1);
assert.equal(next.checkpoint, 100);
const replayConflict = await edge("bulk-apply", { ...batch, rationale: "Changed payload" }, 409, key);
assert.equal(replayConflict.error.code, "IDEMPOTENCY_CONFLICT");

await edge("rights-review", { ...rights, expectedDraftRevision: next.draftRevision, decision: "unresolved" }, 200, randomUUID());
const stale = await edge("bulk-apply", { ...batch, offset: 100, targets: targets(next), expectedDraftRevision: next.draftRevision, batchId: randomUUID() }, 409, randomUUID());
assert.equal(stale.error.code, "REVISION_CONFLICT");
assert.equal(sql(`select count(*) from private.vtv_editorial_events where operation='bulk-review' and input->>'selectionId'='${selection.selectionId}';`), "100");
assert.equal(sql(`select count(*) from private.vtv_bulk_batches where selection_id='${selection.selectionId}';`), "1");
console.log("PASS real Edge bulk selection, anonymous RPC denial, concurrent retry, source-revision conflict, and audit");
