import { canonicalJson, normalizeSpelling } from "./dictionary-contract.ts";
import { parseEditorialRequest } from "./editorial-contract.ts";
import { decodeEditorialCursor, encodeEditorialCursor, type CursorPosition } from "./editorial-cursor.ts";
import { ImportOperationError } from "./trusted-dictionary-types.ts";
import { editorialRequestHash, type WorkflowContext } from "./trusted-dictionary-workflow.ts";
export async function handleEditorial(body: object, text: string, { config, cors, respond }: WorkflowContext): Promise<Response> {
    if (new TextEncoder().encode(text).length > 64 * 1024) return respond(413, "PAYLOAD_TOO_LARGE", "Request is too large");
    const editorial = parseEditorialRequest(body);
    const limiter = "idempotencyKey" in editorial ? config.consumeMutationLimit : config.consumeReadLimit;
    if (!limiter || (editorial.operation === "create-candidate" ? !config.createCandidate : editorial.operation === "select-answer" ? !config.selectAnswer : editorial.operation === "review" ? !config.editorialReview : editorial.operation === "rights-review" ? !config.rightsReview : !config.editorialRead)) return respond(503, "TEMPORARILY_UNAVAILABLE", "Service unavailable", editorial.requestId);
    try {
      if (editorial.operation === "create-candidate") {
        if (!config.createCandidate) throw new Error("Unavailable");
        const hash = await editorialRequestHash(editorial);
        const data = await config.createCandidate(editorial, hash, normalizeSpelling(editorial.input.original));
        return Response.json({ ok: true, requestId: editorial.requestId, data }, { headers: cors });
      }
      const delay = await limiter();
      if (!Number.isSafeInteger(delay) || delay < 0) throw new Error("Rate limit unavailable");
      if (delay > 0) return respond(429, "RATE_LIMITED", "Too many requests", editorial.requestId, { "Retry-After": String(delay) });
    } catch { return respond(503, "TEMPORARILY_UNAVAILABLE", "Service unavailable", editorial.requestId); }
    try {
      if (editorial.operation === "select-answer") {
        if (!config.selectAnswer) throw new Error("Unavailable");
        const hash = await editorialRequestHash(editorial);
        const data = await config.selectAnswer(editorial, hash);
        return Response.json({ ok: true, requestId: editorial.requestId, data }, { headers: cors });
      }
      if (editorial.operation === "rights-review") {
        if (!config.rightsReview) throw new Error("Unavailable");
        const hash = await editorialRequestHash(editorial);
        const data = await config.rightsReview(editorial, hash);
        return Response.json({ ok: true, requestId: editorial.requestId, data }, { headers: cors });
      }
      if (editorial.operation === "review") {
        if (!config.editorialReview) throw new Error("Unavailable");
        const hash = await editorialRequestHash(editorial);
        const data = await config.editorialReview(editorial, hash, normalizeSpelling(editorial.input.original));
        return Response.json({ ok: true, requestId: editorial.requestId, data }, { headers: cors });
      }
      if (!config.editorialRead) throw new Error("Unavailable");
      const scope = editorial.operation === "collision" ? canonicalJson({ operation: "collision", normalized: editorial.input.normalized, level: editorial.input.level }) : editorial.operation === "list" ? canonicalJson({ operation: "list", filters: editorial.input.filters }) : editorial.operation === "candidate-sources" ? "candidate-sources" : canonicalJson({ operation: "list-history", entryId: editorial.input.entryId });
      let position: CursorPosition | null = null;
      if (editorial.operation !== "detail" && editorial.input.cursor) {
        try { position = await decodeEditorialCursor(config.secret, scope, editorial.input.cursor); }
        catch { return respond(400, "INVALID_CURSOR", "Invalid cursor", editorial.requestId); }
      }
      const raw = await config.editorialRead(editorial, position);
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("Invalid response");
      const data = Object.fromEntries(Object.entries(raw));
      if (editorial.operation === "detail") {
        const history = await config.editorialRead({ operation: "list-history", requestId: editorial.requestId, input: { entryId: editorial.input.entryId, cursor: null, limit: 50 } }, null);
        if (typeof history !== "object" || history === null || Array.isArray(history)) throw new Error("Invalid response");
        const page = Object.fromEntries(Object.entries(history));
        const next = page.nextPosition;
        if (next !== null && next !== undefined) {
          if (typeof next !== "object" || !("createdAt" in next) || typeof next.createdAt !== "string" || !("id" in next) || typeof next.id !== "string") throw new Error("Invalid response");
          page.nextCursor = await encodeEditorialCursor(config.secret, scope, { createdAt: next.createdAt, id: next.id });
        } else page.nextCursor = null;
        delete page.nextPosition;
        data.history = page;
      } else {
        const next = data.nextPosition;
        if (next !== null && next !== undefined) {
          if (typeof next !== "object" || !("createdAt" in next) || typeof next.createdAt !== "string" || !("id" in next) || typeof next.id !== "string") throw new Error("Invalid response");
          data.nextCursor = await encodeEditorialCursor(config.secret, scope, { createdAt: next.createdAt, id: next.id });
        } else data.nextCursor = null;
        delete data.nextPosition;
      }
      const output = JSON.stringify({ ok: true, requestId: editorial.requestId, data });
      if (new TextEncoder().encode(output).length > 1024 * 1024) throw new Error("Response too large");
      return new Response(output, { headers: { ...cors, "Content-Type": "application/json" } });
    } catch (error) {
      if (error instanceof ImportOperationError) return respond(error.code === "NOT_FOUND" ? 404 : error.code === "INVALID_INPUT" ? 400 : 409, error.code, "Editorial request could not be completed", editorial.requestId);
      return respond(503, "TEMPORARILY_UNAVAILABLE", "Service unavailable", editorial.requestId);
    }
}
