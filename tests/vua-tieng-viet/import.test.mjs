import { test } from "node:test";
import assert from "node:assert/strict";
import { parseImportMutation } from "../../lib/vua-tieng-viet/import-contract.ts";

const requestId = "30000000-0000-4000-8000-000000000003";
const idempotencyKey = "40000000-0000-4000-8000-000000000004";
const artifactId = "50000000-0000-4000-8000-000000000005";

test("import start accepts a bounded identity and rejects unrecognized fields", () => {
  const envelope = { operation: "import-start", requestId, idempotencyKey, input: { artifactId, artifactRevision: "fixture-v1", chunkCount: 2 } };
  assert.equal(parseImportMutation(envelope).operation, "import-start");
  assert.throws(() => parseImportMutation({ ...envelope, extra: true }));
  assert.throws(() => parseImportMutation({ ...envelope, input: { ...envelope.input, chunkCount: 101 } }));
});

test("import apply and finalize reject malformed identities and revisions", () => {
  const importId = "60000000-0000-4000-8000-000000000006";
  const apply = { operation: "import-apply", requestId, idempotencyKey, input: { importId, document: {}, canonicalHash: "a".repeat(64) } };
  assert.equal(parseImportMutation(apply).operation, "import-apply");
  assert.throws(() => parseImportMutation({ ...apply, input: { ...apply.input, canonicalHash: "A".repeat(64) } }));
  const finalize = { operation: "import-finalize", requestId, idempotencyKey, input: { importId, expectedDraftRevision: "0" } };
  assert.equal(parseImportMutation(finalize).operation, "import-finalize");
  for (const revision of ["01", "-1", "1.2", "9223372036854775808"]) assert.throws(() => parseImportMutation({ ...finalize, input: { ...finalize.input, expectedDraftRevision: revision } }));
});

test("apply verification recomputes the hash and rejects invalid or mismatched chunks", async () => {
  const { verifyImportChunk } = await import("../../lib/vua-tieng-viet/import-contract.ts");
  const { readFileSync } = await import("node:fs");
  const { createHash } = await import("node:crypto");
  const { canonicalJson } = await import("../../lib/vua-tieng-viet/dictionary-contract.ts");
  const doc = JSON.parse(readFileSync("tests/vua-tieng-viet/fixtures/synthetic.json", "utf8"));
  const hash = createHash("sha256").update(canonicalJson(doc)).digest("hex");
  const checked = await verifyImportChunk(doc, hash);
  assert.equal(checked.entries[0].normalized, "TIẾNGVIỆT");
  await assert.rejects(() => verifyImportChunk(doc, "0".repeat(64)));
  await assert.rejects(() => verifyImportChunk({ ...doc, normalizerVersion: "vi-latin-v1" }, hash));
});

test("trusted import start reaches the privileged seam only after authentication", async () => {
  const { handlePreview } = await import("../../lib/vua-tieng-viet/preview-handler.ts");
  const { createHmac } = await import("node:crypto");
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const payload = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role: "admin", iat: 999, exp: 1100 })}`;
  const token = `${payload}.${createHmac("sha256", "secret").update(payload).digest("base64url")}`;
  let calls = 0;
  const envelope = { operation: "import-start", requestId, idempotencyKey, input: { artifactId, artifactRevision: "fixture-v1", chunkCount: 1 } };
  const request = new Request("https://example.invalid", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(envelope) });
  const response = await handlePreview(request, { secret: "secret", origins: ["https://app.example"], consumeLimit: async () => 0, now: () => 1000, consumeImportLimit: async () => 0, consumeMutationLimit: async () => 0, mutate: async (mutation) => { calls++; return { importId: artifactId, expectedChunks: mutation.input.chunkCount }; } });
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
});

test("trusted apply refuses a mismatched hash before mutation", async () => {
  const { handlePreview } = await import("../../lib/vua-tieng-viet/preview-handler.ts");
  const { createHmac } = await import("node:crypto");
  const { readFileSync } = await import("node:fs");
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role: "admin", iat: 999, exp: 1100 })}`;
  const token = `${unsigned}.${createHmac("sha256", "secret").update(unsigned).digest("base64url")}`;
  const doc = JSON.parse(readFileSync("tests/vua-tieng-viet/fixtures/synthetic.json", "utf8"));
  const envelope = { operation: "import-apply", requestId, idempotencyKey, input: { importId: artifactId, document: doc, canonicalHash: "0".repeat(64) } };
  let calls = 0;
  const response = await handlePreview(new Request("https://example.invalid", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(envelope) }), { secret: "secret", origins: ["https://app.example"], now: () => 1000, consumeLimit: async () => 0, consumeImportLimit: async () => 0, mutate: async () => { calls++; return {}; } });
  assert.equal(response.status, 422);
  assert.equal(calls, 0);
});

test("trusted import returns a bounded structured conflict reason", async () => {
  const { handlePreview, ImportOperationError } = await import("../../lib/vua-tieng-viet/preview-handler.ts");
  const { createHmac } = await import("node:crypto");
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role: "admin", iat: 999, exp: 1100 })}`;
  const token = `${unsigned}.${createHmac("sha256", "secret").update(unsigned).digest("base64url")}`;
  const envelope = { operation: "import-finalize", requestId, idempotencyKey, input: { importId: artifactId, expectedDraftRevision: "0" } };
  const response = await handlePreview(new Request("https://example.invalid", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(envelope) }), { secret: "secret", origins: ["https://app.example"], now: () => 1000, consumeLimit: async () => 0, consumeMutationLimit: async () => 0, mutate: async () => { throw new ImportOperationError("IMPORT_CONFLICT", "MISSING_CHUNKS", { chunkIndex: 2 }); } });
  const result = await response.json();
  assert.equal(response.status, 409);
  assert.equal(result.error.code, "IMPORT_CONFLICT");
  assert.equal(result.error.reason, "MISSING_CHUNKS");
  assert.deepEqual(result.error.location, { chunkIndex: 2 });
});
