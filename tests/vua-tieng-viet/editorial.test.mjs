import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEditorialRequest } from "../../lib/vua-tieng-viet/editorial-contract.ts";

const requestId = "30000000-0000-4000-8000-000000000003";
const idempotencyKey = "40000000-0000-4000-8000-000000000004";
const entryId = "50000000-0000-4000-8000-000000000005";
const checks = { names: true, abbreviations: true, offensive: true, malformed: true, unverified: true };
const review = { operation: "review", requestId, idempotencyKey, input: { entryId, expectedEntryRevision: 1, expectedDraftRevision: "0", original: "tiếng Việt", definitionVi: "Ngôn ngữ của người Việt.", review: "approved", answerEligible: true, category: "common", rationale: "Đã kiểm tra nghĩa và mức phổ biến.", exclusionChecks: checks } };

test("review requires explicit exclusions and a reviewed meaning for answer eligibility", () => {
  assert.equal(parseEditorialRequest(review).operation, "review");
  assert.throws(() => parseEditorialRequest({ ...review, input: { ...review.input, exclusionChecks: { ...checks, names: false } } }));
  assert.throws(() => parseEditorialRequest({ ...review, input: { ...review.input, definitionVi: null } }));
  assert.throws(() => parseEditorialRequest({ ...review, input: { ...review.input, category: "excluded" } }));
  for (const category of ["technical","less-common","regional","rare"]) {
    assert.equal(parseEditorialRequest({ ...review, input: { ...review.input, category } }).input.category, category);
  }
});

test("an answer with a meaning warning requires acknowledgment at the trusted boundary", () => {
  const input = { ...review.input, definitionVi: "Cách dùng cổ.".normalize("NFD") };
  assert.throws(() => parseEditorialRequest({ ...review, input }), /explicit meaning review/);
  assert.ok(parseEditorialRequest({ ...review, input: { ...input, meaningWarningAcknowledged: true } }).input.meaningWarningAcknowledged);
  assert.equal(parseEditorialRequest({ ...review, input: { ...input, answerEligible: false } }).operation, "review");
});

test("keyset cursors reject tampering and changed filters", async () => {
  const { encodeEditorialCursor, decodeEditorialCursor } = await import("../../lib/vua-tieng-viet/editorial-cursor.ts");
  const after = { createdAt: "2026-01-01T00:00:00.000Z", id: entryId };
  const token = await encodeEditorialCursor("test-secret", "list:filters-a", after);
  assert.deepEqual(await decodeEditorialCursor("test-secret", "list:filters-a", token), after);
  await assert.rejects(() => decodeEditorialCursor("test-secret", "list:filters-b", token));
  await assert.rejects(() => decodeEditorialCursor("test-secret", "list:filters-a", `${token.slice(0, -1)}!`));
});

test("authenticated list cursors are bound to the selected filters", async () => {
  const { handlePreview } = await import("../../lib/vua-tieng-viet/preview-handler.ts");
  const { createHmac } = await import("node:crypto");
  const enc = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
  const unsigned = `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ role: "admin", iat: 1000, exp: 1100 })}`;
  const token = `${unsigned}.${createHmac("sha256", "secret").update(unsigned).digest("base64url")}`;
  const filters = { sourceId: null, level: 3, review: null, hasDefinition: null, collisionsOnly: false };
  let calls = 0;
  const config = { secret: "secret", origins: ["https://app.example"], now: () => 1001, consumeLimit: async () => 0, consumeReadLimit: async () => 0, editorialRead: async () => { calls++; return { items: [], nextPosition: { createdAt: "2026-01-01T00:00:00.000Z", id: entryId }, draftRevision: "0" }; } };
  const send = (input) => handlePreview(new Request("https://example.invalid", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ operation: "list", requestId, input }) }), config);
  const first = await send({ filters, cursor: null, limit: 1 });
  const result = await first.json();
  assert.equal(first.status, 200);
  assert.equal(typeof result.data.nextCursor, "string");
  const changed = await send({ filters: { ...filters, level: 5 }, cursor: result.data.nextCursor, limit: 1 });
  assert.equal(changed.status, 400);
  assert.equal((await changed.json()).error.code, "INVALID_CURSOR");
  assert.equal(calls, 1);
});

test("editorial review denies unauthorized requests before privileged calls", async () => {
  const { handlePreview } = await import("../../lib/vua-tieng-viet/preview-handler.ts");
  let calls = 0;
  const response = await handlePreview(new Request("https://example.invalid", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(review) }), { secret: "secret", origins: ["https://app.example"], now: () => 1000, consumeLimit: async () => 0, consumeMutationLimit: async () => 0, editorialReview: async () => { calls++; return {}; } });
  assert.equal(response.status, 401);
  assert.equal(calls, 0);
});

test("review preserves idempotency and maps stale writes to a safe 409", async () => {
  const { handlePreview, ImportOperationError } = await import("../../lib/vua-tieng-viet/preview-handler.ts");
  const { createHmac } = await import("node:crypto");
  const encode = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role: "admin", iat: 1000, exp: 1100 })}`;
  const token = `${unsigned}.${createHmac("sha256", "secret").update(unsigned).digest("base64url")}`;
  let hashes = [];
  const config = { secret: "secret", origins: ["https://app.example"], now: () => 1001, consumeLimit: async () => 0, consumeMutationLimit: async () => 0, editorialReview: async (_request, hash) => { hashes.push(hash); if (hashes.length > 2) throw new ImportOperationError("REVISION_CONFLICT"); return { revisionNumber: 2 }; } };
  const send = (value) => handlePreview(new Request("https://example.invalid", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(value) }), config);
  assert.equal((await send(review)).status, 200);
  assert.equal((await send({ ...review, requestId: "60000000-0000-4000-8000-000000000006" })).status, 200);
  assert.equal(hashes[0], hashes[1]);
  const conflict = await send(review);
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error.code, "REVISION_CONFLICT");
});

test("candidate filters and history pages enforce strict bounded inputs", () => {
  const filters = { sourceId: null, level: 3, review: "pending", hasDefinition: true, collisionsOnly: false };
  const request = { operation: "list", requestId, input: { filters, cursor: null, limit: 50 } };
  assert.equal(parseEditorialRequest(request).operation, "list");
  assert.equal(parseEditorialRequest({ operation: "list", requestId, input: { filters, cursor: null } }).input.limit, 50);
  assert.throws(() => parseEditorialRequest({ ...request, input: { ...request.input, filters: { ...filters, level: 4 } } }));
  assert.throws(() => parseEditorialRequest({ ...request, input: { ...request.input, filters: { ...filters, unexpected: true } } }));
  assert.throws(() => parseEditorialRequest({ ...request, input: { ...request.input, limit: 101 } }));
  assert.throws(() => parseEditorialRequest({ operation: "list-history", requestId, input: { entryId, cursor: "x".repeat(513), limit: 50 } }));
});

test("ordinary request size is rejected before full JSON parsing", async () => {
  const { parseStrictJson } = await import("../../lib/vua-tieng-viet/strict-json.ts");
  const text = JSON.stringify({ operation: "list", input: { padding: "x".repeat(64 * 1024) } });
  assert.throws(() => parseStrictJson(text, 520 * 1024, 512 * 1024, 64 * 1024), RangeError);
  const invalidOperation = JSON.stringify({ operation: { padding: "x".repeat(64 * 1024) }, input: {} });
  assert.throws(() => parseStrictJson(invalidOperation, 520 * 1024, 512 * 1024, 64 * 1024), RangeError);
});

test("manual candidate creation validates accent-preserving spelling and keeps duplicate confirmation explicit", async () => {
  const { handlePreview, ImportOperationError } = await import("../../lib/vua-tieng-viet/preview-handler.ts");
  const { createHmac } = await import("node:crypto");
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role: "admin", iat: 1000, exp: 1100 })}`;
  const authorization = `Bearer ${unsigned}.${createHmac("sha256", "secret").update(unsigned).digest("base64url")}`;
  const body = { operation: "create-candidate", requestId, idempotencyKey, input: {
    original: " họa mi ".normalize("NFD"), definitionVi: null, sourceId: entryId, entryUrl: null, sourceEntryId: null, sourceSenseId: null,
    allowAlternateMeaning: false, expectedDraftRevision: "5",
  } };
  let attempts = 0;
  const config = {
    secret: "secret", origins: ["https://app.example"], now: () => 1001, consumeLimit: async () => 0, consumeMutationLimit: async () => 0,
    createCandidate: async (request, _hash, spelling) => {
      attempts++;
      assert.deepEqual(spelling, { normalized: "HỌAMI", level: 5 });
      assert.equal(request.input.original, "họa mi");
      if (!request.input.allowAlternateMeaning) throw new ImportOperationError("SPELLING_EXISTS");
      return { entryId, review: "pending" };
    },
  };
  const send = (input, authenticated = true) => handlePreview(new Request("https://example.invalid", {
    method: "POST", headers: { "content-type": "application/json", ...(authenticated ? { authorization } : {}) }, body: JSON.stringify({ ...body, input }),
  }), config);
  assert.equal((await send(body.input, false)).status, 401);
  assert.equal((await send({ ...body.input, original: "họa mi\t" })).status, 400);
  assert.equal((await send({ ...body.input, entryUrl: "https://credential@example.com" })).status, 400);
  assert.equal(attempts, 0);
  const duplicate = await send(body.input);
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).error.code, "SPELLING_EXISTS");
  assert.equal((await send({ ...body.input, allowAlternateMeaning: true })).status, 200);
  assert.equal(attempts, 2);
});
