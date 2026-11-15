import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEditorialRequest } from "../../lib/vua-tieng-viet/editorial-contract.ts";

const requestId = "30000000-0000-4000-8000-000000000003";
const choice = { operation: "select-answer", requestId, idempotencyKey: requestId, input: { normalized: "MÈO", level: 3, entryRevisionId: requestId, expectedDraftRevision: "0" } };
test("answer selection requires canonical accent-preserving spelling and exact revision input", () => {
  assert.deepEqual(parseEditorialRequest(choice), choice);
  for (const input of [{ ...choice.input, normalized: "mèo" }, { ...choice.input, normalized: "MÈO" }, { ...choice.input, level: 5 }, { ...choice.input, entryRevisionId: "bad" }, { ...choice.input, expectedDraftRevision: "9223372036854775808" }, { ...choice.input, answerEligible: true }]) {
    assert.throws(() => parseEditorialRequest({ ...choice, input }));
  }
});

test("selection is authorized, rate limited, hashed for retry and maps stale revisions safely", async () => {
  const { handlePreview, ImportOperationError } = await import("../../lib/vua-tieng-viet/preview-handler.ts");
  const { createHmac } = await import("node:crypto");
  const enc = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ role: "admin", iat: 1000, exp: 1100 })}`;
  const token = `${unsigned}.${createHmac("sha256", "secret").update(unsigned).digest("base64url")}`;
  const hashes = [];
  let delay = 0;
  const config = { secret: "secret", origins: ["https://app.example"], now: () => 1001, consumeLimit: async () => 0, consumeMutationLimit: async () => delay, selectAnswer: async (request, hash) => { hashes.push(hash); assert.deepEqual(request.input, choice.input); if (hashes.length > 2) throw new ImportOperationError("REVISION_CONFLICT"); return { selection: request.input, draftRevision: "1" }; } };
  const send = (value, auth = token) => handlePreview(new Request("https://example.invalid", { method: "POST", headers: { authorization: `Bearer ${auth}`, "content-type": "application/json" }, body: JSON.stringify(value) }), config);
  assert.equal((await send(choice, "bad")).status, 401);
  delay = 4;
  const limited = await send(choice);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("Retry-After"), "4");
  assert.equal(hashes.length, 0);
  delay = 0;
  assert.equal((await send(choice)).status, 200);
  assert.equal((await send({ ...choice, requestId: "60000000-0000-4000-8000-000000000006" })).status, 200);
  assert.equal(hashes[0], hashes[1]);
  const stale = await send(choice);
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).error.code, "REVISION_CONFLICT");
});
