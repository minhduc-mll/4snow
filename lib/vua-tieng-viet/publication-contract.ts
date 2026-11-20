export type PublicationRequest =
  | { operation: "publication-game"; requestId: string; input: { buildId: string; contentHash: string } }
  | { operation: "configuration"; requestId: string; idempotencyKey: string; input: { expectedDraftRevision: string; attemptLimit: number; initialAbsentCount?: number } }
  | { operation: "publication-preview"; requestId: string; idempotencyKey: string; input: { expectedDraftRevision: string } }
  | { operation: "publish"; requestId: string; idempotencyKey: string; input: { buildId: string; expectedDraftRevision: string; expectedCurrentReleaseId: string | null; contentHash: string } };
export function isInitialAbsentCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 17;
}

export function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exact(value: Record<string, unknown>, keys: string[]) { return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)); }
export function isUuid(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value); }
export function isRevision(value: unknown): value is string { return typeof value === "string" && /^(0|[1-9][0-9]{0,18})$/.test(value) && BigInt(value) <= BigInt("9223372036854775807"); }
export function isContentHash(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

export function parsePublicationRequest(value: unknown): PublicationRequest {
  if (isRecord(value) && value.operation === "publication-game" && exact(value, ["operation", "requestId", "input"]) && isUuid(value.requestId) && isRecord(value.input) && exact(value.input, ["buildId", "contentHash"]) && isUuid(value.input.buildId) && isContentHash(value.input.contentHash)) {
    return { operation: value.operation, requestId: value.requestId, input: { buildId: value.input.buildId, contentHash: value.input.contentHash } };
  }
  if (!isRecord(value) || !exact(value, ["operation", "requestId", "idempotencyKey", "input"]) || !isUuid(value.requestId) || !isUuid(value.idempotencyKey) || !isRecord(value.input) || !isRevision(value.input.expectedDraftRevision)) throw new Error("Invalid publication request");
  const input = value.input;
  if (value.operation === "configuration" && exact(input,Object.hasOwn(input,"initialAbsentCount") ? ["expectedDraftRevision","attemptLimit","initialAbsentCount"] : ["expectedDraftRevision","attemptLimit"]) && (!Object.hasOwn(input,"initialAbsentCount") || isInitialAbsentCount(input.initialAbsentCount)) && typeof input.attemptLimit === "number" && Number.isInteger(input.attemptLimit) && input.attemptLimit >= 1 && input.attemptLimit <= 12) return { operation: "configuration", requestId: value.requestId, idempotencyKey: value.idempotencyKey, input: { expectedDraftRevision: value.input.expectedDraftRevision, attemptLimit: input.attemptLimit, ...(isInitialAbsentCount(input.initialAbsentCount) ? { initialAbsentCount: input.initialAbsentCount } : {}) } };
  if (value.operation === "publication-preview" && exact(input, ["expectedDraftRevision"])) return { operation: "publication-preview", requestId: value.requestId, idempotencyKey: value.idempotencyKey, input: { expectedDraftRevision: value.input.expectedDraftRevision } };
  if (value.operation === "publish" && exact(input, ["buildId", "expectedDraftRevision", "expectedCurrentReleaseId", "contentHash"]) && isUuid(input.buildId) && isContentHash(input.contentHash) && (input.expectedCurrentReleaseId === null || isUuid(input.expectedCurrentReleaseId))) return { operation: "publish", requestId: value.requestId, idempotencyKey: value.idempotencyKey, input: { buildId: input.buildId, expectedDraftRevision: value.input.expectedDraftRevision, expectedCurrentReleaseId: input.expectedCurrentReleaseId, contentHash: input.contentHash } };
  throw new Error("Invalid publication request");
}
