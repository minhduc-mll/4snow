import { previewImport } from "./preview.ts";
import { parseStrictJson } from "./strict-json.ts";
import { parseImportMutation, verifyImportChunk, type VerifiedChunk } from "./import-contract.ts";
import { canonicalJson } from "./dictionary-contract.ts";
import { ImportOperationError } from "./trusted-dictionary-types.ts";
import type { WorkflowContext } from "./trusted-dictionary-workflow.ts";
export async function handleImport(body: object & { operation: unknown }, text: string, { config, cors, respond }: WorkflowContext): Promise<Response> {
    if (body.operation !== "import-preview") {
      const mutation = parseImportMutation(body);
      if (mutation.operation !== "import-apply" && new TextEncoder().encode(text).length > 64 * 1024) return respond(413, "PAYLOAD_TOO_LARGE", "Request is too large", mutation.requestId);
      const limiter = mutation.operation === "import-apply" ? config.consumeImportLimit : config.consumeMutationLimit;
      if (!config.mutate || !limiter) return respond(503, "TEMPORARILY_UNAVAILABLE", "Service unavailable", mutation.requestId);
      {
        try {
          const retryAfter = await limiter();
          if (!Number.isSafeInteger(retryAfter) || retryAfter < 0) throw new Error("Rate limit unavailable");
          if (retryAfter > 0) return respond(429, "RATE_LIMITED", "Too many requests", mutation.requestId, { "Retry-After": String(retryAfter) });
        } catch { return respond(503, "TEMPORARILY_UNAVAILABLE", "Service unavailable", mutation.requestId); }
      }
      let verified: VerifiedChunk | null = null;
      if (mutation.operation === "import-apply") {
        try { verified = await verifyImportChunk(mutation.input.document, mutation.input.canonicalHash); }
        catch { return respond(422, "VALIDATION_FAILED", "Invalid import chunk", mutation.requestId); }
      }
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson({ operation: mutation.operation, input: mutation.input })));
      const requestHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      try {
        const data = await config.mutate(mutation, requestHash, verified);
        return Response.json({ ok: true, requestId: mutation.requestId, data }, { headers: cors });
      } catch (error) {
        if (error instanceof ImportOperationError) return respond(error.code === "NOT_FOUND" ? 404 : error.code === "INVALID_INPUT" ? 400 : 409, error.code, "Import request could not be completed", mutation.requestId, {}, error.reason, error.location);
        return respond(503, "TEMPORARILY_UNAVAILABLE", "Service unavailable", mutation.requestId);
      }
    }
    parseStrictJson(text, 512 * 1024);
    if (Object.keys(body).sort().join(",") !== "input,operation,requestId" || !("requestId" in body) || typeof body.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.requestId) || !("input" in body)) return respond(400, "INVALID_INPUT", "Invalid request");
    try {
      const retryAfter = await config.consumeLimit();
      if (!Number.isSafeInteger(retryAfter) || retryAfter < 0) throw new Error("Rate limit unavailable");
      if (retryAfter > 0) return respond(429, "RATE_LIMITED", "Too many requests", body.requestId, { "Retry-After": String(retryAfter) });
    } catch { return respond(503, "TEMPORARILY_UNAVAILABLE", "Service unavailable", body.requestId); }
    if (typeof body.input === "object" && body.input !== null && (("schemaVersion" in body.input && body.input.schemaVersion !== 1) || ("normalizerVersion" in body.input && body.input.normalizerVersion !== "vi-nfc-v2"))) return respond(400, "UNSUPPORTED_SCHEMA", "Unsupported schema", body.requestId);
    const data = await previewImport(JSON.stringify(body.input));
    return Response.json({ ok: true, requestId: body.requestId, data }, { headers: cors });
}
