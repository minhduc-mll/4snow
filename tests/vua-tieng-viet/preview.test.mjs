import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStrictJson } from "../../lib/vua-tieng-viet/strict-json.ts";

test("strict JSON rejects duplicate keys even when escaped or nested", () => {
  assert.throws(() => parseStrictJson('{"a":1,"\\u0061":2}'));
  assert.throws(() => parseStrictJson('{"inner":{"x":1,"x":2}}'));
  assert.deepEqual(parseStrictJson('{"one":{"x":1},"two":{"x":2}}'), { one: { x: 1 }, two: { x: 2 } });
});

test("preview detects normalized spelling collisions without approving candidates", async () => {
  const { previewImport } = await import("../../lib/vua-tieng-viet/preview.ts");
  const { readFileSync } = await import("node:fs");
  const doc = JSON.parse(readFileSync("tests/vua-tieng-viet/fixtures/synthetic.json", "utf8"));
  doc.entries.push({ ...doc.entries[0], externalId: "synthetic-2", original: "tiếng việt" });
  const result = await previewImport(JSON.stringify(doc));
  assert.equal(result.valid, true);
  assert.equal(result.entryCount, 2);
  assert.equal(result.collisionCount, 1);
  assert.match(result.canonicalHash, /^[0-9a-f]{64}$/);
});

test("custom admin JWT requires a valid signature, role and timestamps", async () => {
  const { verifyCustomAdminJwt } = await import("../../lib/vua-tieng-viet/admin-jwt.ts");
  const { createHmac } = await import("node:crypto");
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const sign = (header, payload, secret = "test-secret") => {
    const body = `${encode(header)}.${encode(payload)}`;
    return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
  };
  const header = { alg: "HS256", typ: "JWT" };
  const valid = { role: "admin", iat: 1000, exp: 1100 };
  assert.equal(await verifyCustomAdminJwt(sign(header, valid), "test-secret", 1001), true);
  for (const token of [sign(header, valid, "wrong"), sign({ ...header, alg: "none" }, valid), sign(header, { ...valid, role: "user" }), sign(header, { ...valid, exp: 1001 }), sign(header, { ...valid, iat: 1032 }), sign(header, { ...valid, nbf: 1002 }), sign(header, { ...valid, exp: 1100.5 })]) {
    assert.equal(await verifyCustomAdminJwt(token, "test-secret", 1001), false);
  }
});

test("preview boundary denies unauthorized requests before touching rate storage", async () => {
  const { handlePreview } = await import("../../lib/vua-tieng-viet/preview-handler.ts");
  let calls = 0;
  const response = await handlePreview(new Request("https://example.invalid", { method: "POST", headers: { origin: "https://app.example" }, body: "{}" }), {
    secret: "secret", origins: ["https://app.example"], consumeLimit: async () => { calls++; return 0; }, now: () => 1000,
  });
  assert.equal(response.status, 401);
  assert.equal(calls, 0);
});

test("preview boundary validates origin, bearer token and rate-limit responses", async () => {
  const { handlePreview } = await import("../../lib/vua-tieng-viet/preview-handler.ts");
  const { createHmac } = await import("node:crypto");
  const { readFileSync } = await import("node:fs");
  const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ role: "admin", iat: 1000, exp: 1100 })}`;
  const token = `${unsigned}.${createHmac("sha256", "secret").update(unsigned).digest("base64url")}`;
  const doc = JSON.parse(readFileSync("tests/vua-tieng-viet/fixtures/synthetic.json", "utf8"));
  const body = JSON.stringify({ operation: "import-preview", requestId: "30000000-0000-4000-8000-000000000003", input: doc });
  const request = (origin = "https://app.example") => new Request("https://example.invalid", { method: "POST", headers: { origin, authorization: `Bearer ${token}`, "content-type": "application/json" }, body });
  const config = { secret: "secret", origins: ["https://app.example"], consumeLimit: async () => 0, now: () => 1001 };
  const good = await handlePreview(request(), config);
  assert.equal(good.status, 200);
  assert.equal((await good.json()).data.valid, true);
  assert.equal((await handlePreview(request("https://attacker.invalid"), config)).status, 403);
  const limited = await handlePreview(request(), { ...config, consumeLimit: async () => 7 });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "7");
  assert.equal((await handlePreview(request(), { ...config, secret: "" })).status, 503);
  const oldBody = JSON.stringify({ operation: "import-preview", requestId: "30000000-0000-4000-8000-000000000003", input: { ...doc, normalizerVersion: "vi-latin-v1" } });
  const oldRequest = new Request("https://example.invalid", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: oldBody });
  const oldResponse = await handlePreview(oldRequest, config);
  assert.equal(oldResponse.status, 400);
  assert.equal((await oldResponse.json()).error.code, "UNSUPPORTED_SCHEMA");
});

test("preview reports bounded indexed errors for invalid entries", async () => {
  const { previewImport } = await import("../../lib/vua-tieng-viet/preview.ts");
  const { readFileSync } = await import("node:fs");
  const doc = JSON.parse(readFileSync("tests/vua-tieng-viet/fixtures/synthetic.json", "utf8"));
  doc.entries = Array.from({ length: 102 }, (_, index) => ({ ...doc.entries[0], externalId: `bad-${index}`, original: "a!" }));
  const result = await previewImport(JSON.stringify(doc));
  assert.equal(result.valid, false);
  assert.equal(result.errors.length, 100);
  assert.equal(result.errors[0].field, "entries[0]");
  assert.equal(result.errorsTruncated, true);
});

test("trusted preview rejects oversized streamed input and malformed JSON", async () => {
  const { handlePreview } = await import("../../lib/vua-tieng-viet/preview-handler.ts");
  const { createHmac } = await import("node:crypto");
  const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ role: "admin", iat: 1000, exp: 1100 })}`;
  const token = `${body}.${createHmac("sha256", "secret").update(body).digest("base64url")}`;
  const send = (bodyText) => new Request("https://example.invalid", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: bodyText });
  const config = { secret: "secret", origins: ["https://app.example"], consumeLimit: async () => 0, now: () => 1001 };
  const prefix = '{"operation":"import-preview","requestId":"30000000-0000-4000-8000-000000000003","input":';
  assert.equal((await handlePreview(send(prefix + JSON.stringify({ a: "x".repeat(512 * 1024) }) + "}"), config)).status, 413);
  assert.equal((await handlePreview(send(prefix + '{"a":1,"a":2}}'), config)).status, 400);
});

test("candidate identities use source revision and digest rather than source UUID", async () => {
  const { previewImport } = await import("../../lib/vua-tieng-viet/preview.ts");
  const { readFileSync } = await import("node:fs");
  const doc = JSON.parse(readFileSync("tests/vua-tieng-viet/fixtures/synthetic.json", "utf8"));
  const other = "30000000-0000-4000-8000-000000000003";
  doc.sources.push({ ...doc.sources[0], sourceId: other });
  doc.entries.push({ ...doc.entries[0], sourceId: other });
  const result = await previewImport(JSON.stringify(doc));
  assert.equal(result.valid, false);
  assert.equal(result.duplicateCount, 1);
});
