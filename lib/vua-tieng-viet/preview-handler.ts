import { verifyCustomAdminJwt } from "./admin-jwt.ts";
import { parseStrictJson } from "./strict-json.ts";
import { ImportOperationError, type PreviewDependencies, type ImportConflictReason, type ImportConflictLocation } from "./trusted-dictionary-types.ts";
import { handleImport } from "./trusted-dictionary-import.ts";
import { handleEditorial } from "./trusted-dictionary-editorial.ts";
import { handleBulkReview } from "./trusted-dictionary-bulk.ts";
import { handlePublication } from "./trusted-dictionary-publication.ts";
export { ImportOperationError } from "./trusted-dictionary-types.ts";
export type { ImportErrorCode, ImportConflictReason, ImportConflictLocation, PreviewDependencies } from "./trusted-dictionary-types.ts";
const MAX_BODY = 520 * 1024;
const INVALID_REQUEST_ID = "00000000-0000-0000-0000-000000000000";

async function readLimited(request: Request): Promise<string> {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BODY) throw new RangeError("Too large");
  if (!request.body) throw new Error("Missing body");
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let result = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); throw new RangeError("Too large"); }
      result += decoder.decode(chunk.value, { stream: true });
    }
    return result + decoder.decode();
  } finally { reader.releaseLock(); }
}

export async function handlePreview(request: Request, config: PreviewDependencies): Promise<Response> {
  const origin = request.headers.get("origin");
  const allowed = origin === null || config.origins.includes(origin);
  const cors: Record<string, string> = origin && allowed ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" } : {};
  const respond = (status: number, code: string, message: string, requestId = INVALID_REQUEST_ID, extra: Record<string, string> = {}, reason?: ImportConflictReason, location?: ImportConflictLocation): Response => Response.json({ ok: false, requestId, error: { code, message, ...(reason ? { reason } : {}), ...(location ? { location } : {}) } }, { status, headers: { ...cors, ...extra } });
  if (!allowed) return respond(403, "ORIGIN_DENIED", "Origin is not allowed");
  if (!config.secret || config.origins.length === 0) return respond(503, "TEMPORARILY_UNAVAILABLE", "Service unavailable");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Vary": "Origin" } });
  if (request.method !== "POST") return respond(400, "INVALID_INPUT", "Invalid request");
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ") || !await verifyCustomAdminJwt(authorization.slice(7), config.secret, config.now())) return respond(401, "UNAUTHORIZED", "Unauthorized");
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") ?? "")) return respond(400, "INVALID_INPUT", "Invalid request");
  try {
    const text = await readLimited(request);
    const body = parseStrictJson(text, 520 * 1024, 512 * 1024, 64 * 1024);
    if (typeof body !== "object" || body === null || Array.isArray(body) || !("operation" in body)) return respond(400, "INVALID_INPUT", "Invalid request");
    const context = { config, cors, respond };
    if (body.operation === "bulk-create" || body.operation === "bulk-page" || body.operation === "bulk-apply") return await handleBulkReview(body, text, context);
    if (body.operation === "publication-game" || body.operation === "publication-preview" || body.operation === "publish" || body.operation === "configuration") return await handlePublication(body, context);
    if (body.operation === "list" || body.operation === "detail" || body.operation === "list-history" || body.operation === "review" || body.operation === "rights-review" || body.operation === "select-answer" || body.operation === "collision") return await handleEditorial(body, text, context);
    return await handleImport(body, text, context);
  } catch (error) {
    if (error instanceof RangeError) return respond(413, "PAYLOAD_TOO_LARGE", "Request is too large");
    if (error instanceof ImportOperationError) return respond(error.code === "NOT_FOUND" ? 404 : error.code === "INVALID_INPUT" ? 400 : 409, error.code, "Import request could not be completed");
    return respond(400, "INVALID_INPUT", "Invalid request");
  }
}
