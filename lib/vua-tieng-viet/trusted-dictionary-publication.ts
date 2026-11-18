import { parsePublicationRequest } from "./publication-contract.ts";
import { ImportOperationError } from "./trusted-dictionary-types.ts";
import { editorialRequestHash, type WorkflowContext } from "./trusted-dictionary-workflow.ts";
export async function handlePublication(body: object, { config, cors, respond }: WorkflowContext): Promise<Response> {
    const publication = parsePublicationRequest(body);
    const limiter = publication.operation === "publish" ? config.consumePublicationLimit : publication.operation === "configuration" ? config.consumeMutationLimit : publication.operation === "publication-game" ? config.consumeReadLimit : config.consumeLimit;
    if (!limiter || !config.publication) return respond(503, "TEMPORARILY_UNAVAILABLE", "Service unavailable", publication.requestId);
    try {
      const delay = await limiter();
      if (!Number.isSafeInteger(delay) || delay < 0) throw new Error("Invalid limit");
      if (delay) return respond(429, "RATE_LIMITED", "Too many requests", publication.requestId, { "Retry-After": String(delay) });
      const hash = publication.operation === "publication-game" ? "" : await editorialRequestHash(publication);
      const data = await config.publication(publication, hash);
      const output = JSON.stringify({ ok: true, requestId: publication.requestId, data });
      const maxBytes = publication.operation === "publication-game" ? 2 * 1024 * 1024 + 4096 : 1024 * 1024;
      if (new TextEncoder().encode(output).length > maxBytes) throw new Error("Response too large");
      return new Response(output, { headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
    } catch (error) {
      if (error instanceof ImportOperationError) return respond(error.code === "NOT_FOUND" ? 404 : error.code === "INVALID_INPUT" ? 400 : error.code === "RELEASE_INCOMPLETE" ? 422 : 409, error.code, "Publication request could not be completed", publication.requestId);
      return respond(503, "TEMPORARILY_UNAVAILABLE", "Service unavailable", publication.requestId);
    }
}
