import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
const env = Object.fromEntries(readFileSync("supabase/.temp/start-secrets/supabase_edge_runtime_4snow/env/docker.env", "utf8").split(/\r?\n/).filter(line => line.includes("=")).map(line => { const i = line.indexOf("="); return [line.slice(0,i),line.slice(i+1)]; }));
const base = "http://127.0.0.1:54321";
const service = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };
let userId;
try {
  const email = `rights-${randomUUID()}@example.invalid`, password = `${randomUUID()}Aa1!`;
  const created = await fetch(`${base}/auth/v1/admin/users`, { method: "POST", headers: service, body: JSON.stringify({ email, password, email_confirm: true }) });
  assert.equal(created.status,200); userId = (await created.json()).id;
  const login = await fetch(`${base}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: env.SUPABASE_ANON_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  assert.equal(login.status,200); const token = (await login.json()).access_token;
  for (const bearer of [env.SUPABASE_ANON_KEY,token]) {
    const headers = { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" };
    for (const [name,input] of [["vtv_review_rights",{p_request_id:randomUUID(),p_idempotency_key:randomUUID(),p_request_hash:"a".repeat(64),p_input:{}}],["vtv_candidate_detail",{p_entry_id:randomUUID()}]]) {
      const response = await fetch(`${base}/rest/v1/rpc/${name}`,{method:"POST",headers,body:JSON.stringify(input)});
      assert.ok([401,403].includes(response.status)); assert.equal((await response.json()).code,"42501");
    }
    const response = await fetch(`${base}/rest/v1/vtv_rights_reviews?select=*`,{headers:{...headers,"Accept-Profile":"private"}});
    assert.equal(response.status,406); assert.equal((await response.json()).code,"PGRST106");
  }
  console.log("PASS rights-review access denied for anon and real authenticated roles");
} finally {
  if(userId) { const response = await fetch(`${base}/auth/v1/admin/users/${userId}`,{method:"DELETE",headers:service}); assert.equal(response.status,200); }
}
