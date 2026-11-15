import test from "node:test";
import assert from "node:assert/strict";
import { parsePublicationRequest } from "../../lib/vua-tieng-viet/publication-contract.ts";
import { parseDraftConfiguration } from "../../lib/vua-tieng-viet/publication-response.ts";
const id = "30000000-0000-4000-8000-000000000003";
const request = { operation: "configuration", requestId: id, idempotencyKey: id, input: { expectedDraftRevision: "1", attemptLimit: 6 } };
test("draft configuration responses require the fixed historical rules and checked identity/revision", () => {
  const data = { draftRevision: "2", configuration: { configurationId: id, attemptLimit: 12, normalizerVersion: "vi-nfc-v2", levels: [3,5,7,9] } };
  assert.deepEqual(parseDraftConfiguration(data),data);
  for (const change of [{ attemptLimit: 1.5 },{ levels: [3,5,7] },{ normalizerVersion: "vi-latin-v1" },{ configurationId: "wrong" }]) assert.throws(() => parseDraftConfiguration({ ...data, configuration: { ...data.configuration,...change } }));
  assert.throws(() => parseDraftConfiguration({ ...data, draftRevision: "01" }));
});
test("attempt drafts accept only bounded integer attempts and no fixed-rule overrides", () => {
  for (const attemptLimit of [1,6,12]) assert.deepEqual(parsePublicationRequest({ ...request, input: { ...request.input, attemptLimit } }).input,{ expectedDraftRevision: "1", attemptLimit });
  for (const attemptLimit of [0,13,1.5,"6",null,true,NaN,Infinity]) assert.throws(() => parsePublicationRequest({ ...request, input: { ...request.input, attemptLimit } }));
  for (const extra of [{ normalizerVersion: "vi-latin-v1" },{ levels: [3] },{ configurationId: id }]) assert.throws(() => parsePublicationRequest({ ...request, input: { ...request.input,...extra } }));
});
test("configuration Edge calls authorize, rate-limit, hash retries and map stale writes", async () => {
  const { handlePreview, ImportOperationError } = await import("../../lib/vua-tieng-viet/preview-handler.ts");
  const { createHmac } = await import("node:crypto");
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "HS256",typ: "JWT" })}.${encode({ role: "admin",iat: 1000,exp: 1100 })}`;
  const token = `${unsigned}.${createHmac("sha256","secret").update(unsigned).digest("base64url")}`;
  const hashes = []; let delay = 0, mode = "ok";
  const config = { secret: "secret",origins: ["https://app.example"],now: () => 1001,consumeLimit: async () => { throw Error("wrong preview limit"); },consumeMutationLimit: async () => delay,publication: async (_body,hash) => { hashes.push(hash); if (mode === "conflict") throw new ImportOperationError("REVISION_CONFLICT"); return { draftRevision: "2" }; } };
  const send = (body = request,bearer = token) => handlePreview(new Request("https://example.invalid",{ method: "POST",headers: { Authorization: `Bearer ${bearer}`,"Content-Type": "application/json" },body: JSON.stringify(body) }),config);
  assert.equal((await send(request,"bad")).status,401); assert.equal(hashes.length,0);
  assert.equal((await send()).status,200);
  assert.equal((await send({ ...request,requestId: "40000000-0000-4000-8000-000000000004" })).status,200); assert.equal(hashes[0],hashes[1]);
  delay = 7; const limited = await send(); assert.equal(limited.status,429); assert.equal(limited.headers.get("Retry-After"),"7");
  delay = 0; mode = "conflict"; assert.equal((await send()).status,409);
  assert.equal((await send({ ...request,input: { ...request.input,attemptLimit: 1.5 } })).status,400);
});
