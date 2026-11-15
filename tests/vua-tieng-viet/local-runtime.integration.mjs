// Isolated real Edge runtimes; no changes to the running application's secrets.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHmac, randomUUID } from "node:crypto";

const docker = (args) => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const env = Object.fromEntries(readFileSync("supabase/.temp/start-secrets/supabase_edge_runtime_4snow/env/docker.env", "utf8").split(/\r?\n/).filter((line) => line.includes("=")).map((line) => { const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1)]; }));
const runtime = JSON.parse(docker(["inspect", "supabase_edge_runtime_4snow"]))[0];
const network = Object.keys(runtime.NetworkSettings.Networks)[0];
const fixture = JSON.parse(readFileSync("tests/vua-tieng-viet/fixtures/synthetic.json", "utf8"));
const origin = env.VTV_ALLOWED_ORIGINS.split(",")[0].trim();
const active = new Set();
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role: "admin", iat: now, exp: now + 3600 })}`;
const token = `${unsigned}.${createHmac("sha256", env.ADMIN_JWT_SECRET).update(unsigned).digest("base64url")}`;
const body = () => JSON.stringify({ operation: "import-preview", requestId: randomUUID(), input: fixture });
async function start(values) {
  const name = `vtv-verification-${randomUUID()}`;
  const args = ["run", "--detach", "--rm", "--name", name, "--network", network, "--publish", "127.0.0.1::8081"];
  for (const directory of ["lib/vua-tieng-viet", "scripts/vua-tieng-viet", "supabase/functions"]) args.push("--mount", `type=bind,source=${resolve(directory)},target=/workspace/${directory},readonly`);
  for (const [key, value] of Object.entries(values)) args.push("--env", `${key}=${value}`);
  args.push("--entrypoint", "edge-runtime", runtime.Config.Image, "start", "--main-service=/workspace/supabase/functions/vtv-dictionary", "--port=8081");
  docker(args);
  active.add(name);
  const info = JSON.parse(docker(["inspect", name]))[0];
  const port = info.NetworkSettings.Ports["8081/tcp"][0].HostPort;
  const url = `http://127.0.0.1:${port}/`;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { method: "OPTIONS", signal: AbortSignal.timeout(1000) });
      await response.arrayBuffer();
      return { name, url };
    } catch { await new Promise((done) => setTimeout(done, 100)); }
  }
  throw new Error("Isolated runtime did not become ready");
}
async function send(url, includeOrigin = true) {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...(includeOrigin ? { Origin: origin } : {}), Authorization: `Bearer ${token}` }, body: body(), signal: AbortSignal.timeout(15000) });
}
function stop(name) { docker(["stop", "--time", "1", name]); active.delete(name); }

try {
  const values = { ADMIN_JWT_SECRET: env.ADMIN_JWT_SECRET, VTV_ALLOWED_ORIGINS: env.VTV_ALLOWED_ORIGINS, SUPABASE_URL: env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY };
  for (const missing of Object.keys(values)) {
    const isolated = await start(Object.fromEntries(Object.entries(values).filter(([name]) => name !== missing)));
    // Without an origin allowlist, browser requests are denied with 403 first;
    // a no-Origin request must also fail closed with configuration error 503.
    const response = await send(isolated.url, missing !== "VTV_ALLOWED_ORIGINS");
    assert.equal(response.status, 503, `Missing ${missing} must fail closed`);
    const text = await response.text();
    const result = JSON.parse(text);
    assert.equal(result.error.code, "TEMPORARILY_UNAVAILABLE");
    for (const secret of [env.ADMIN_JWT_SECRET, env.SUPABASE_SERVICE_ROLE_KEY, token]) assert.ok(!text.includes(secret));
    stop(isolated.name);
    console.log(`PASS isolated Edge runtime fails closed without ${missing}`);
  }
  // Two actual runtime processes share the database limiter. Do not reset it.
  const one = await start(values);
  const two = await start(values);
  const remaining = Math.max(0, Number(docker(["exec", "supabase_db_4snow", "psql", "-U", "postgres", "-d", "postgres", "-At", "-c", "select coalesce(ceil(extract(epoch from max(window_start) + interval '1 minute' - clock_timestamp())),0) from private.vtv_preview_rate_limit where role_key='admin';"])));
  assert.ok(Number.isFinite(remaining) && remaining >= 0 && remaining <= 60);
  if (remaining > 0) {
    console.log(`Waiting ${remaining}s for the existing preview limit window; no rate-limit records are reset.`);
    let milliseconds = remaining * 1000 + 100;
    while (milliseconds > 0) { const interval = Math.min(milliseconds, 10000); await new Promise((done) => setTimeout(done, interval)); milliseconds -= interval; }
  }
  const results = await Promise.all(Array.from({ length: 31 }, (_, index) => send(index % 2 === 0 ? one.url : two.url)));
  assert.ok(results.every((result) => [200, 429].includes(result.status)));
  assert.equal(results.filter((result) => result.status === 429).length, 1);
  assert.equal(results.filter((result) => result.status === 200).length, 30);
  for (const result of results) {
    if (result.status === 429) assert.ok(Number(result.headers.get("Retry-After")) > 0);
    await result.arrayBuffer();
  }
  console.log("PASS two isolated local Edge instances: exactly 30 previews accepted and 1 limited in a fresh shared window");
} catch {
  // Docker commands carry env values; never forward raw Docker errors.
  console.error("Isolated runtime verification failed; inspect the assertion/configuration locally without sharing credentials.");
  process.exitCode = 1;
} finally {
  for (const name of active) {
    try { stop(name); } catch { console.error("Temporary verification container cleanup failed"); process.exitCode = 1; }
  }
}
