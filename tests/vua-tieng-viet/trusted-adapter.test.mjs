import { test } from "node:test";
import assert from "node:assert/strict";
import { createDictionaryAdapter } from "../../supabase/functions/vtv-dictionary/adapter.ts";
import { ImportOperationError } from "../../lib/vua-tieng-viet/preview-handler.ts";

test("trusted adapter maps only operation-specific RPC errors and retains import conflict details", async () => {
  const originalFetch = globalThis.fetch;
  let response = { message: "IMPORT_CONFLICT", details: JSON.stringify({ reason: "DUPLICATE_IDENTITY", chunkIndex: 2, entryIndex: 3 }) };
  globalThis.fetch = async (url, options) => {
    assert.equal(options.headers.apikey, "private-key");
    assert.equal(options.headers.Authorization, "Bearer private-key");
    assert.match(url, /\/rest\/v1\/rpc\//);
    return Response.json(response, { status: 409 });
  };
  try {
    const adapter = createDictionaryAdapter("https://database.example", "private-key");
    const mutation = { operation: "import-start", requestId: "request", idempotencyKey: "key", input: { artifactId: "artifact", artifactRevision: "revision", chunkCount: 1 } };
    await assert.rejects(adapter.mutate(mutation, "hash", null), (error) => error instanceof ImportOperationError && error.code === "IMPORT_CONFLICT" && error.reason === "DUPLICATE_IDENTITY" && error.location.chunkIndex === 2 && error.location.entryIndex === 3);
    response = { message: "IMPORT_CONFLICT", details: "private database detail" };
    await assert.rejects(adapter.editorialRead({ operation: "detail", requestId: "request", input: { entryId: "entry" } }, null), (error) => !(error instanceof ImportOperationError) && error.message === "Read unavailable");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
