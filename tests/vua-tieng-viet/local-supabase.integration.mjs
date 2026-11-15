// Opt-in integration check: writes synthetic records to an existing LOCAL stack.
// Run alone: node tests/vua-tieng-viet/local-supabase.integration.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHmac, randomUUID, createHash } from "node:crypto";
import { canonicalJson } from "../../lib/vua-tieng-viet/dictionary-contract.ts";

const base = "http://127.0.0.1:54321";
const secretsPath = "supabase/.temp/start-secrets/supabase_edge_runtime_4snow/env/docker.env";
const env = Object.fromEntries(readFileSync(secretsPath, "utf8").split(/\r?\n/).filter((line) => line.includes("=")).map((line) => {
  const index = line.indexOf("=");
  return [line.slice(0, index), line.slice(index + 1)];
}));
for (const name of ["ADMIN_JWT_SECRET", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "VTV_ALLOWED_ORIGINS"]) assert.ok(env[name], `Missing local ${name}`);
const origin = env.VTV_ALLOWED_ORIGINS.split(",")[0].trim();
const now = Math.floor(Date.now() / 1000);
function jwt(payload, header = { alg: "HS256", typ: "JWT" }, secret = env.ADMIN_JWT_SECRET) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const input = `${encode(header)}.${encode(payload)}`;
  return `${input}.${createHmac("sha256", secret).update(input).digest("base64url")}`;
}
const token = jwt({ role: "admin", iat: now, exp: now + 3600 });
async function http(path, options = {}) {
  return fetch(`${base}${path}`, { ...options, signal: AbortSignal.timeout(15000) });
}
async function edge(body, expected = 200, bearer = token, requestOrigin = origin, retryLimitWindow = true) {
  const response = await http("/functions/v1/vtv-dictionary", { method: "POST", headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${bearer}`, "Content-Type": "application/json", Origin: requestOrigin }, body: typeof body === "string" ? body : JSON.stringify(body) });
  if (response.status === 429 && expected === 200 && retryLimitWindow) {
    const seconds = Number(response.headers.get("Retry-After"));
    assert.ok(seconds > 0 && seconds <= 60);
    await response.arrayBuffer();
    console.log(`Waiting ${seconds}s for an existing setup rate-limit window.`);
    let milliseconds = seconds * 1000 + 100;
    while (milliseconds > 0) { const interval = Math.min(milliseconds, 10000); await new Promise((done) => setTimeout(done, interval)); milliseconds -= interval; }
    return edge(body, expected, bearer, requestOrigin, false);
  }
  if (expected !== null) assert.equal(response.status, expected, `Edge ${typeof body === "string" ? "raw request" : body.operation} status`);
  const data = await response.json();
  const encoded = JSON.stringify(data);
  for (const secret of [env.ADMIN_JWT_SECRET, env.SUPABASE_SERVICE_ROLE_KEY, token]) assert.ok(!encoded.includes(secret), "Response must not expose credentials");
  return { response, data };
}
const request = (operation, input, key) => ({ operation, requestId: randomUUID(), input, ...(key ? { idempotencyKey: key } : {}) });
const filters = { sourceId: null, level: null, review: null, hasDefinition: null, collisionsOnly: false };
const list = (overrides = {}) => request("list", { filters, cursor: null, limit: 50, ...overrides });
function sql(query) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_4snow", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

let userId;
try {
  const deniedTokens = ["", "invalid", jwt({ role: "admin", iat: now, exp: now + 60 }, undefined, "wrong-secret"), jwt({ role: "user", iat: now, exp: now + 60 }), jwt({ role: "admin", iat: now - 120, exp: now - 60 }), jwt({ role: "admin", iat: now + 100, exp: now + 200 }), jwt({ role: "admin", iat: now, exp: now + 60 }, { alg: "none", typ: "JWT" }), jwt({ role: "admin", iat: now, exp: now + 60 }, { alg: "HS256", typ: "other" }), jwt({ role: "admin", iat: now, exp: now + 60, nbf: now + 30 }), jwt({ role: "admin", iat: now, exp: now + 60.5 }), jwt({ role: "admin", iat: "now", exp: now + 60 })];
  for (const value of deniedTokens) await edge(list(), 401, value);
  await edge(list(), 403, token, "https://disallowed.example.invalid");
  const preflight = await http("/functions/v1/vtv-dictionary", { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,apikey,content-type" } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
  const actualOrigin = (await edge(list())).response.headers.get("access-control-allow-origin");
  assert.equal(actualOrigin, origin);
  const deniedPreflight = await http("/functions/v1/vtv-dictionary", { method: "OPTIONS", headers: { Origin: "https://disallowed.example.invalid", "Access-Control-Request-Method": "POST" } });
  assert.equal(deniedPreflight.status, 403);
  assert.equal(deniedPreflight.headers.get("access-control-allow-origin"), null);
  await edge('{"operation":"list","operation":"detail"}', 400);
  await edge(" ".repeat(521 * 1024), 413);
  console.log("PASS local gateway JWT, CORS, malformed/oversized requests and credential-safe errors");

  // Use a real Auth-issued user token, not a locally forged authenticated claim.
  const password = randomUUID() + "Aa1!";
  const email = `vtv-verification-${randomUUID()}@example.invalid`;
  const serviceHeaders = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };
  const created = await http("/auth/v1/admin/users", { method: "POST", headers: serviceHeaders, body: JSON.stringify({ email, password, email_confirm: true }) });
  assert.equal(created.status, 200, "Create isolated verification user");
  userId = (await created.json()).id;
  assert.equal(typeof userId, "string");
  const signedIn = await http("/auth/v1/token?grant_type=password", { method: "POST", headers: { apikey: env.SUPABASE_ANON_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  assert.equal(signedIn.status, 200);
  const userToken = (await signedIn.json()).access_token;
  assert.equal(typeof userToken, "string");
  const claims = JSON.parse(Buffer.from(userToken.split(".")[1], "base64url").toString());
  assert.equal(claims.role, "authenticated");
  const routines = JSON.parse(sql("select coalesce(json_agg(json_build_object('name',p.proname,'args',p.proargnames[1:p.pronargs])), '[]') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'vtv_%';"));
  const tables = JSON.parse(sql("select json_agg(tablename) from pg_tables where schemaname='private' and tablename like 'vtv_%';"));
  for (const bearer of [env.SUPABASE_ANON_KEY, userToken]) {
    const headers = { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" };
    for (const routine of routines) {
      const result = await http(`/rest/v1/rpc/${routine.name}`, { method: "POST", headers, body: JSON.stringify(Object.fromEntries((routine.args ?? []).map((name) => [name, null]))) });
      const error = await result.json();
      assert.ok([401, 403].includes(result.status), `Browser denial for ${routine.name}`);
      assert.equal(error.code, "42501", `Permission denial for ${routine.name}`);
    }
    for (const table of tables) {
      const result = await http(`/rest/v1/${table}?select=*&limit=1`, { headers: { ...headers, "Accept-Profile": "private" } });
      assert.equal(result.status, 406, "Private schema must not be exposed");
      assert.equal((await result.json()).code, "PGRST106");
    }
  }
  console.log(`PASS anon and real authenticated user denied ${routines.length} RPCs and ${tables.length} private tables`);

  const fixture = JSON.parse(readFileSync("tests/vua-tieng-viet/fixtures/synthetic.json", "utf8"));
  fixture.artifactId = randomUUID();
  fixture.artifactRevision = `verification-${randomUUID()}`;
  fixture.sources[0].sourceId = randomUUID();
  fixture.sources[0].resourceRevision = fixture.artifactRevision;
  fixture.sources[0].artifactSha256 = createHash("sha256").update(fixture.artifactRevision).digest("hex");
  fixture.entries[0].sourceId = fixture.sources[0].sourceId;
  fixture.entries.push({ ...fixture.entries[0], externalId: "synthetic-2", sourceEntryId: "synthetic-entry-2", sourceSenseId: "synthetic-sense-2" });
  const preview = (await edge(request("import-preview", fixture))).data.data;
  assert.equal(preview.valid, true);
  assert.equal(preview.canonicalHash, createHash("sha256").update(canonicalJson(fixture)).digest("hex"));
  const startInput = { artifactId: fixture.artifactId, artifactRevision: fixture.artifactRevision, chunkCount: 1 };
  const startKey = randomUUID();
  const starts = await Promise.all([edge(request("import-start", startInput, startKey)), edge(request("import-start", startInput, startKey))]);
  assert.deepEqual(starts[0].data.data, starts[1].data.data, "Concurrent starts return same receipt");
  const session = starts[0].data.data;
  const before = (await edge(list({ filters: { ...filters, sourceId: fixture.sources[0].sourceId } }))).data.data;
  assert.equal(before.items.length, 0);
  await edge(request("import-finalize", { importId: session.importId, expectedDraftRevision: before.draftRevision }, randomUUID()), 409);
  const applyInput = { importId: session.importId, document: fixture, canonicalHash: preview.canonicalHash };
  const applyKey = randomUUID();
  const applied = await Promise.all([edge(request("import-apply", applyInput, applyKey)), edge(request("import-apply", applyInput, applyKey))]);
  assert.deepEqual(applied[0].data.data, applied[1].data.data, "Concurrent retries preserve receipt");
  const resumed = (await edge(request("import-start", startInput, randomUUID()))).data.data;
  assert.equal(resumed.importId, session.importId);
  assert.equal(resumed.receipts.length, 1);
  const finalizeInput = { importId: session.importId, expectedDraftRevision: before.draftRevision };
  const finalizeKey = randomUUID();
  const finalized = (await edge(request("import-finalize", finalizeInput, finalizeKey))).data.data;
  assert.equal(finalized.status, "finalized");
  assert.deepEqual((await edge(request("import-finalize", finalizeInput, finalizeKey))).data.data, finalized, "Lost response retry preserves finalized receipt");
  console.log("PASS real gateway preview/start/concurrent apply/resume/finalize/retry; staging hidden and missing chunks rejected");

  // Source UUIDs in upload documents are references, not persisted source IDs.
  const persistedSourceId = sql(`select id from private.vtv_sources where resource_revision='${fixture.artifactRevision}';`);
  assert.match(persistedSourceId, /^[0-9a-f-]{36}$/);
  const selectedFilters = { ...filters, sourceId: persistedSourceId, collisionsOnly: true };
  const first = (await edge(list({ filters: selectedFilters, limit: 1 }))).data.data;
  assert.equal(first.items.length, 1);
  assert.equal(typeof first.nextCursor, "string");
  const second = (await edge(list({ filters: selectedFilters, limit: 1, cursor: first.nextCursor }))).data.data;
  assert.equal(second.items.length, 1);
  assert.notEqual(second.items[0].id, first.items[0].id);
  await edge(list({ filters: { ...selectedFilters, level: 3 }, cursor: first.nextCursor }), 400);
  await edge(list({ filters: selectedFilters, cursor: first.nextCursor + "!" }), 400);
  const entryId = first.items[0].id;
  const detail = (await edge(request("detail", { entryId }))).data.data;
  // List items expose the current revision used by the editor.
  const current = first.items[0];
  assert.equal(current.review, "pending");
  const input = { entryId, expectedEntryRevision: current.revisionNumber, expectedDraftRevision: first.draftRevision, original: current.original, definitionVi: current.definitionVi, review: "approved", answerEligible: true, category: "common", rationale: "Synthetic integration verification only.", exclusionChecks: { names: true, abbreviations: true, offensive: true, malformed: true, unverified: true } };
  assert.ok(detail, "Detail returned");
  const reviewKey = randomUUID();
  const reviews = await Promise.all([edge(request("review", input, reviewKey)), edge(request("review", input, reviewKey))]);
  assert.deepEqual(reviews[0].data.data, reviews[1].data.data);
  const approved = reviews[0].data.data;
  assert.equal(approved.review, "approved");
  await edge(request("review", input, randomUUID()), 409);
  const edited = (await edge(request("review", { ...input, expectedEntryRevision: approved.revisionNumber, expectedDraftRevision: approved.draftRevision, definitionVi: "Nghĩa giả lập đã chỉnh sửa." }, randomUUID()))).data.data;
  assert.equal(edited.review, "pending");
  assert.equal(edited.answerEligible, false);
  const history = (await edge(request("list-history", { entryId, cursor: null, limit: 50 }))).data.data;
  assert.ok(history.items.length >= 3);
  console.log("PASS real editorial filtering/pagination/cursor rejection/detail/approval/concurrent retries/stale rejection/edit reset/history");

  // Final burst does not reset or delete existing rate-limit records.
  const burst = await Promise.all(Array.from({ length: 31 }, () => edge(request("import-preview", fixture), null)));
  assert.ok(burst.every(({ response }) => response.status === 200 || response.status === 429));
  assert.ok(burst.some(({ response }) => response.status === 429), "Shared preview limit enforced");
  assert.ok(burst.filter(({ response }) => response.status === 200).length <= 30);
  for (const { response } of burst.filter(({ response }) => response.status === 429)) assert.ok(Number(response.headers.get("Retry-After")) > 0);
  console.log("PASS concurrent local preview burst enforces shared limit with Retry-After (not a cross-instance test)");
  if (process.argv.includes("--editorial-limits")) {
    const remaining = Math.max(0, Number(sql("select coalesce(ceil(extract(epoch from max(window_start) + interval '1 minute' - clock_timestamp())),0) from (select window_start from private.vtv_read_rate_limit where role_key='admin' union all select window_start from private.vtv_import_mutation_rate_limit where role_key='admin') windows;")));
    assert.ok(Number.isFinite(remaining) && remaining <= 60);
    if (remaining > 0) {
      console.log(`Waiting ${remaining}s for existing editorial limit windows; no limit records are reset.`);
      let milliseconds = remaining * 1000 + 100;
      while (milliseconds > 0) { const interval = Math.min(milliseconds, 10000); await new Promise((done) => setTimeout(done, interval)); milliseconds -= interval; }
    }
    // Bound in-flight work: threshold verification is not an overload benchmark.
    const batches = async (count, send) => {
      const results = [];
      for (let offset = 0; offset < count; offset += 5) results.push(...await Promise.all(Array.from({ length: Math.min(5, count - offset) }, send)));
      return results;
    };
    const [reads, writes] = await Promise.all([
      batches(121, () => edge(list({ filters: selectedFilters }), null)),
      // Stale requests exercise the mutation limiter without adding revisions.
      batches(31, () => edge(request("review", input, randomUUID()), null)),
    ]);
    const summary = (results) => Object.fromEntries([...new Set(results.map(({ response }) => response.status))].map((status) => [status, results.filter(({ response }) => response.status === status).length]));
    console.log(`Editorial limit response counts: reads=${JSON.stringify(summary(reads))}; mutations=${JSON.stringify(summary(writes))}`);
    assert.equal(reads.filter(({ response }) => response.status === 200).length, 120);
    assert.equal(reads.filter(({ response }) => response.status === 429).length, 1);
    assert.equal(writes.filter(({ response }) => response.status === 409).length, 30);
    assert.equal(writes.filter(({ response }) => response.status === 429).length, 1);
    for (const { response, data } of [...reads, ...writes].filter(({ response }) => response.status === 429)) {
      assert.ok(Number(response.headers.get("Retry-After")) > 0);
      assert.equal(data.error.code, "RATE_LIMITED");
    }
    console.log("PASS real gateway fresh-window limits: 120 reads allowed/1 limited; 30 stale mutations rejected/1 limited");
  }
} finally {
  if (userId) {
    const response = await http(`/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } });
    assert.equal(response.status, 200, "Remove isolated verification Auth user");
  }
}
