import { ImportOperationError } from "../../../lib/vua-tieng-viet/preview-handler.ts";
import type { ImportConflictLocation, ImportConflictReason, ImportErrorCode, PreviewDependencies } from "../../../lib/vua-tieng-viet/preview-handler.ts";

function conflictReason(value: unknown): ImportConflictReason | undefined {
  if (value === "ARTIFACT_MISMATCH" || value === "CHUNK_HASH_MISMATCH" || value === "IMPORT_NOT_STAGING" || value === "ARTIFACT_LIMIT" || value === "MISSING_CHUNKS" || value === "SOURCE_METADATA_MISMATCH" || value === "DUPLICATE_IDENTITY" || value === "SOURCE_REFERENCE" || value === "CANDIDATE_CONTENT_MISMATCH") return value;
  return undefined;
}

function conflictDetails(value: unknown): { reason?: ImportConflictReason; location?: ImportConflictLocation } {
  if (typeof value !== "string") return {};
  const plain = conflictReason(value);
  if (plain) return { reason: plain };
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || !("reason" in parsed)) return {};
    const reason = conflictReason(parsed.reason);
    if (!("chunkIndex" in parsed) || typeof parsed.chunkIndex !== "number" || !Number.isInteger(parsed.chunkIndex) || parsed.chunkIndex < 0 || parsed.chunkIndex >= 100) return { reason };
    const location: ImportConflictLocation = { chunkIndex: parsed.chunkIndex };
    if ("entryIndex" in parsed && typeof parsed.entryIndex === "number" && Number.isInteger(parsed.entryIndex) && parsed.entryIndex >= 0 && parsed.entryIndex < 200) location.entryIndex = parsed.entryIndex;
    return { reason, location };
  } catch { return {}; }
}


export function createDictionaryAdapter(url: string, serviceKey: string): Omit<PreviewDependencies, "secret" | "origins" | "now"> {
  const rpc = (name: string, body: string): Promise<Response> => fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST", headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" }, body,
  });
  const limit = async (name: string): Promise<number> => {
    const response = await rpc(name, "{}");
    if (!response.ok) throw new Error("Rate limit unavailable");
    const result: unknown = await response.json();
    if (typeof result !== "number") throw new Error("Invalid rate-limit result");
    return result;
  };
  const call = async (name: string, body: string, allowed: readonly ImportErrorCode[], unavailable: string, includeDetails = false): Promise<unknown> => {
    const response = await rpc(name, body);
    const result: unknown = await response.json();
    if (!response.ok) {
      if (typeof result === "object" && result !== null && "message" in result) {
        const code = allowed.find((item) => item === result.message);
        if (code) {
          const details = includeDetails ? conflictDetails("details" in result ? result.details : undefined) : {};
          throw new ImportOperationError(code, details.reason, details.location);
        }
      }
      throw new Error(unavailable);
    }
    return result;
  };
  return {
    consumeLimit: () => limit("vtv_consume_preview_limit"),
    consumeImportLimit: () => limit("vtv_consume_import_apply_limit"),
    consumeMutationLimit: () => limit("vtv_consume_import_mutation_limit"),
    consumePublicationLimit: () => limit("vtv_consume_publication_limit"),
    publication: async (operation, requestHash) => {
      if (operation.operation === "publication-game") {
        const parameters = { p_build_id: operation.input.buildId, p_content_hash: operation.input.contentHash };
        return call("vtv_preview_game", JSON.stringify(parameters), ["INVALID_INPUT", "NOT_FOUND", "REVISION_CONFLICT", "RELEASE_INCOMPLETE"], "Preview game unavailable");
      }
      const common = { p_request_id: operation.requestId, p_idempotency_key: operation.idempotencyKey, p_request_hash: requestHash, p_expected_draft_revision: operation.input.expectedDraftRevision };
      const name = operation.operation === "publish" ? "vtv_publish_confirmed" : operation.operation === "configuration" ? "vtv_configure" : "vtv_publication_preview";
      const parameters = operation.operation === "configuration" ? { p_request_id: operation.requestId, p_idempotency_key: operation.idempotencyKey, p_request_hash: requestHash, p_input: operation.input } : operation.operation === "publish" ? { ...common, p_build_id: operation.input.buildId, p_expected_current_release_id: operation.input.expectedCurrentReleaseId, p_content_hash: operation.input.contentHash } : common;
      return call(name, JSON.stringify(parameters), ["INVALID_INPUT", "NOT_FOUND", "IDEMPOTENCY_CONFLICT", "REVISION_CONFLICT", "RELEASE_INCOMPLETE"], "Publication unavailable");
    },
    bulkReview: (operation, hash) => {
      const name = operation.operation === "bulk-create" ? "vtv_bulk_create" : operation.operation === "bulk-page" ? "vtv_bulk_page" : "vtv_bulk_apply";
      const parameters = operation.operation === "bulk-apply"
        ? { p_input: operation.input, p_request_id: operation.requestId, p_idempotency_key: operation.idempotencyKey, p_request_hash: hash }
        : { p_input: operation.input };
      return call(name, JSON.stringify(parameters), ["INVALID_INPUT", "NOT_FOUND", "IDEMPOTENCY_CONFLICT", "REVISION_CONFLICT"], "Bulk review unavailable");
    },
    consumeReadLimit: () => limit("vtv_consume_read_limit"),
    editorialRead: async (operation, position) => {
      if (operation.operation === "candidate-sources") {
        return call("vtv_candidate_sources", JSON.stringify({ p_after_time: position?.createdAt ?? null, p_after_id: position?.id ?? null }), ["INVALID_INPUT"], "Sources unavailable");
      }
      const name = operation.operation === "collision" ? "vtv_collision" : operation.operation === "list" ? "vtv_list_candidates" : operation.operation === "detail" ? "vtv_candidate_detail" : "vtv_candidate_history";
      const parameters = operation.operation === "collision" ? { p_normalized: operation.input.normalized, p_level: operation.input.level, p_after_time: position?.createdAt ?? null, p_after_id: position?.id ?? null, p_limit: operation.input.limit } : operation.operation === "list" ? { p_filters: operation.input.filters, p_after_time: position?.createdAt ?? null, p_after_id: position?.id ?? null, p_limit: operation.input.limit } : operation.operation === "detail" ? { p_entry_id: operation.input.entryId } : { p_entry_id: operation.input.entryId, p_after_time: position?.createdAt ?? null, p_after_id: position?.id ?? null, p_limit: operation.input.limit };
      return call(name, JSON.stringify(parameters), ["NOT_FOUND", "INVALID_INPUT"], "Read unavailable");
    },
    createCandidate: async (operation, requestHash, spelling) => {
      return call("vtv_create_candidate", JSON.stringify({
        p_request_id: operation.requestId, p_idempotency_key: operation.idempotencyKey, p_request_hash: requestHash,
        p_input: operation.input, p_normalized: spelling.normalized, p_level: spelling.level,
      }), ["INVALID_INPUT", "NOT_FOUND", "IDEMPOTENCY_CONFLICT", "REVISION_CONFLICT", "SPELLING_EXISTS"], "Candidate creation unavailable");
    },
    selectAnswer: async (operation, requestHash) => {
      return call("vtv_select_answer", JSON.stringify({ p_request_id: operation.requestId, p_idempotency_key: operation.idempotencyKey, p_request_hash: requestHash, p_input: operation.input }), ["INVALID_INPUT", "NOT_FOUND", "IDEMPOTENCY_CONFLICT", "REVISION_CONFLICT"], "Selection unavailable");
    },
    rightsReview: async (operation, requestHash) => {
      return call("vtv_review_rights", JSON.stringify({ p_request_id: operation.requestId, p_idempotency_key: operation.idempotencyKey, p_request_hash: requestHash, p_input: operation.input }), ["INVALID_INPUT", "NOT_FOUND", "IDEMPOTENCY_CONFLICT", "REVISION_CONFLICT"], "Rights review unavailable");
    },
    editorialReview: async (operation, requestHash, normalized) => {
      return call("vtv_review_candidate", JSON.stringify({ p_request_id: operation.requestId, p_idempotency_key: operation.idempotencyKey, p_request_hash: requestHash, p_input: operation.input, p_normalized: normalized.normalized, p_level: normalized.level }), ["INVALID_INPUT", "NOT_FOUND", "IDEMPOTENCY_CONFLICT", "REVISION_CONFLICT"], "Review unavailable");
    },
    mutate: async (mutation, requestHash, verified) => {
      const common = { p_request_id: mutation.requestId, p_idempotency_key: mutation.idempotencyKey, p_request_hash: requestHash };
      let name: string;
      let parameters: Record<string, unknown>;
      if (mutation.operation === "import-start") {
        name = "vtv_import_start";
        parameters = { ...common, p_artifact_id: mutation.input.artifactId, p_artifact_revision: mutation.input.artifactRevision, p_chunk_count: mutation.input.chunkCount };
      } else if (mutation.operation === "import-apply") {
        if (!verified) throw new Error("Missing validation");
        name = "vtv_import_apply";
        parameters = { ...common, p_import_id: mutation.input.importId, p_payload: mutation.input.document, p_canonical_hash: verified.canonicalHash, p_byte_count: new TextEncoder().encode(JSON.stringify(mutation.input.document)).length, p_derived_entries: verified.entries };
      } else {
        name = "vtv_import_finalize";
        parameters = { ...common, p_import_id: mutation.input.importId, p_expected_draft_revision: mutation.input.expectedDraftRevision };
      }
      return call(name, JSON.stringify(parameters), ["INVALID_INPUT", "NOT_FOUND", "IDEMPOTENCY_CONFLICT", "IMPORT_CONFLICT", "REVISION_CONFLICT"], "Import unavailable", true);
    },
  };
}
