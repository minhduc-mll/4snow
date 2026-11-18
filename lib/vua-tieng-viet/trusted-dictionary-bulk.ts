import { parseBulkRequest } from "./bulk-review-contract.ts";
import { ImportOperationError } from "./trusted-dictionary-types.ts";
import { editorialRequestHash, type WorkflowContext } from "./trusted-dictionary-workflow.ts";

export async function handleBulkReview(body: object, text: string, { config, cors, respond }: WorkflowContext): Promise<Response> {
  if (new TextEncoder().encode(text).length > 64 * 1024) return respond(413, "PAYLOAD_TOO_LARGE", "Request is too large");
  const request = parseBulkRequest(body);
  const limiter = request.operation === "bulk-page" ? config.consumeReadLimit : config.consumeMutationLimit;
  if (!limiter || !config.bulkReview) return respond(503, "TEMPORARILY_UNAVAILABLE", "Service unavailable", request.requestId);
  try {
    const delay = await limiter();
    if (!Number.isSafeInteger(delay) || delay < 0) throw new Error("Rate limit unavailable");
    if (delay) return respond(429, "RATE_LIMITED", "Too many requests", request.requestId, { "Retry-After": String(delay) });
    const data = await config.bulkReview(request, await editorialRequestHash(request));
    return Response.json({ ok: true, requestId: request.requestId, data }, { headers: cors });
  } catch (error) {
    if (error instanceof ImportOperationError) return respond(error.code === "NOT_FOUND" ? 404 : error.code === "INVALID_INPUT" ? 400 : 409, error.code, "Bulk review request could not be completed", request.requestId);
    return respond(503, "TEMPORARILY_UNAVAILABLE", "Service unavailable", request.requestId);
  }
}
