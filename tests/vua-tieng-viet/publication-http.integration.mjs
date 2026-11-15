// Opt-in: run only against the explicitly named disposable dictionary-verification stack on port 56321.
// Apply migrations to a clean database and serve vtv-dictionary before running this test.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";

const base = "http://127.0.0.1:56321";
const secretsPath = "output/dictionary-verification/supabase/.temp/start-secrets/supabase_edge_runtime_dictionary-verification/env/docker.env";
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
function sql(query) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_dictionary-verification", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

const fixture = readFileSync("tests/supabase/publication-fixture.sql", "utf8");
sql(`begin; ${fixture} commit;`);
let revision = sql("select revision from private.vtv_draft where id=1;");
const configInput = {expectedDraftRevision: revision, attemptLimit: 8};
const configKey = randomUUID();
const config = (await edge(request("configuration", configInput, configKey))).data.data;
assert.deepEqual((await edge(request("configuration", configInput, configKey))).data.data, config);
await edge(request("configuration", configInput, randomUUID()), 409);
revision = config.draftRevision;
const preview = (await edge(request("publication-preview", {expectedDraftRevision: revision}, randomUUID()))).data.data;
assert.equal(preview.valid, true);
const publishInput = {buildId: preview.buildId, expectedDraftRevision: revision, expectedCurrentReleaseId: null};
const publishKey = randomUUID();
const receipts = await Promise.all([edge(request("publish", publishInput, publishKey)), edge(request("publish", publishInput, publishKey))]);
assert.deepEqual(receipts[0].data.data, receipts[1].data.data);
assert.equal(sql("select count(*) from private.vtv_editorial_events where operation='publish';"), "1");
assert.equal(sql("select count(*) from private.vtv_editorial_events where operation='configuration';"), "1");
console.log("PASS real Edge configuration, stale revision, idempotent retry, valid publication and concurrent retry through disposable database");
