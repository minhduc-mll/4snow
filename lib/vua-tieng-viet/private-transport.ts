export type PrivateRequest = { operation: string; requestId: string; input: unknown; idempotencyKey?: string };
export type PrivateErrorKind = "UNAUTHORIZED" | "REVISION_CONFLICT" | "IMPORT_CONFLICT" | "IDEMPOTENCY_CONFLICT" | "SPELLING_EXISTS" | "VALIDATION_FAILED" | "RATE_LIMITED" | "UNAVAILABLE" | "CANCELLED";
export class PrivateRequestError extends Error {
  constructor(readonly kind: PrivateErrorKind, readonly details?: unknown, readonly retryAfterSeconds?: number) { super(kind); this.name = "PrivateRequestError"; }
}
export type PrivateTransportDependencies = { url: string | undefined; key: string | undefined; token: () => string | null; signal: (signal: AbortSignal) => AbortSignal; fetch: typeof fetch; unauthorized: () => void };
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export async function privateDictionaryRequest(request: PrivateRequest, signal: AbortSignal, deps: PrivateTransportDependencies): Promise<unknown> {
  let combined = signal;
  try {
    combined = deps.signal(signal);
    if (combined.aborted) throw new PrivateRequestError("CANCELLED");
    if (!deps.url || !deps.key) throw new PrivateRequestError("UNAVAILABLE");
    const token = deps.token();
    if (!token) throw new PrivateRequestError("UNAUTHORIZED");
    const fetchRequest = deps.fetch;
    const response = await fetchRequest(`${deps.url}/functions/v1/vtv-dictionary`, { method: "POST", signal: combined, headers: { "Content-Type": "application/json", apikey: deps.key, Authorization: `Bearer ${token}` }, body: JSON.stringify(request) });
    if (combined.aborted) throw new PrivateRequestError("CANCELLED");
    // Authentication precedes body decoding at the endpoint, so a 401 has no request ID.
    if (response.status === 401) { deps.unauthorized(); throw new PrivateRequestError("UNAUTHORIZED"); }
    const body: unknown = await response.json();
    if (combined.aborted) throw new PrivateRequestError("CANCELLED");
    if (!record(body) || body.requestId !== request.requestId || typeof body.ok !== "boolean") throw new PrivateRequestError("UNAVAILABLE");
    if (response.ok && body.ok && "data" in body) return body.data;
    if (response.ok || body.ok || !record(body.error) || typeof body.error.code !== "string" || typeof body.error.message !== "string") throw new PrivateRequestError("UNAVAILABLE");
    const code = body.error.code;
    const kind: PrivateErrorKind = response.status === 409 ? (code === "IMPORT_CONFLICT" || code === "IDEMPOTENCY_CONFLICT" || code === "SPELLING_EXISTS" ? code : "REVISION_CONFLICT") : response.status === 400 || response.status === 422 ? "VALIDATION_FAILED" : response.status === 429 ? "RATE_LIMITED" : "UNAVAILABLE";
    const retryAfter = Number(response.headers.get("Retry-After"));
    throw new PrivateRequestError(kind, body.error, kind === "RATE_LIMITED" && retryAfter > 0 && retryAfter <= 60 ? retryAfter : undefined);
  } catch (error) {
    if (error instanceof PrivateRequestError) throw error;
    if (combined.aborted) throw new PrivateRequestError("CANCELLED");
    throw new PrivateRequestError("UNAVAILABLE");
  }
}
