import { parseEditorialRequest, type Category, type ExclusionChecks, type Filters } from "./editorial-contract.ts";

export const BULK_BATCH_SIZE = 100;
export const BULK_SELECTION_LIMIT = 20_000;

export type BulkTarget = { entryId: string; expectedEntryRevision: number };
export type BulkDecision = { category: Exclude<Category, "excluded">; answerEligible: boolean; rationale: string; exclusionChecks: ExclusionChecks };
export type BulkCreate = { filters: Filters; expectedDraftRevision: string; targets: BulkTarget[] | null };
export type BulkPageInput = { selectionId: string; offset: number };
export type BulkApply = BulkPageInput & BulkDecision & { selectionHash: string; batchId: string; expectedDraftRevision: string; targets: BulkTarget[] };
export type BulkRequest =
  | { operation: "bulk-create"; requestId: string; input: BulkCreate }
  | { operation: "bulk-page"; requestId: string; input: BulkPageInput }
  | { operation: "bulk-apply"; requestId: string; idempotencyKey: string; input: BulkApply };
type BulkReason = "source-rights" | "missing-meaning" | "meaning-warning" | "answer-collision" | "invalid-spelling" | "entry-revision" | "excluded";
export type BulkRow = BulkTarget & { original: string; definitionVi: string | null; level: number; blocker: BulkReason | null; answerBlocker: BulkReason | null; meaningWarning: boolean; result: BulkItemResult | null };
export type BulkPage = { selectionId: string; selectionHash: string; offset: number; count: number; checkpoint: number; draftRevision: string; distribution: Record<string, number>; totals: Record<BulkItemResult["status"], number>; decision: BulkDecision | null; items: BulkRow[] };
export type BulkItemResult = { entryId: string; status: "applied" | "unchanged" | "conflict" | "invalid"; reason: BulkReason | null };
export type BulkReceipt = { batchId: string; draftRevision: string; checkpoint: number; items: BulkItemResult[] };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function uuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
}
function hash(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}
function revision(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9][0-9]{0,18})$/.test(value) && BigInt(value) <= BigInt("9223372036854775807");
}
function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}
function target(value: unknown): BulkTarget {
  if (!record(value) || !exact(value, ["entryId", "expectedEntryRevision"]) || !uuid(value.entryId) || !integer(value.expectedEntryRevision, 1, 2147483647)) throw new Error("Invalid target");
  return { entryId: value.entryId, expectedEntryRevision: value.expectedEntryRevision };
}
function targets(value: unknown, limit: number): BulkTarget[] {
  if (!Array.isArray(value) || !integer(value.length, 1, limit)) throw new Error("Invalid targets");
  const result = value.map(target);
  if (new Set(result.map((item) => item.entryId)).size !== result.length) throw new Error("Duplicate target");
  return result;
}
function reason(value: unknown): value is BulkReason | null {
  return value === null || value === "source-rights" || value === "missing-meaning" || value === "meaning-warning" || value === "answer-collision" || value === "invalid-spelling" || value === "entry-revision" || value === "excluded";
}

export function parseBulkRequest(value: unknown): BulkRequest {
  if (!record(value) || !uuid(value.requestId) || !record(value.input)) throw new Error("Invalid request");
  const { input, requestId } = value;
  if (value.operation === "bulk-create") {
    if (!exact(value, ["operation", "requestId", "input"]) || !exact(input, ["filters", "expectedDraftRevision", "targets"]) || !revision(input.expectedDraftRevision)) throw new Error("Invalid selection");
    const list = parseEditorialRequest({ operation: "list", requestId, input: { filters: input.filters, cursor: null } });
    if (list.operation !== "list") throw new Error("Invalid filters");
    return { operation: value.operation, requestId, input: { filters: list.input.filters, expectedDraftRevision: input.expectedDraftRevision, targets: input.targets === null ? null : targets(input.targets, 500) } };
  }
  if (!uuid(input.selectionId) || !integer(input.offset, 0, BULK_SELECTION_LIMIT)) throw new Error("Invalid selection position");
  const position = { selectionId: input.selectionId, offset: input.offset };
  if (value.operation === "bulk-page" && exact(value, ["operation", "requestId", "input"]) && exact(input, ["selectionId", "offset"])) return { operation: value.operation, requestId, input: position };
  if (value.operation !== "bulk-apply" || !exact(value, ["operation", "requestId", "idempotencyKey", "input"]) || !uuid(value.idempotencyKey) || !exact(input, ["selectionId", "offset", "selectionHash", "batchId", "expectedDraftRevision", "targets", "category", "answerEligible", "rationale", "exclusionChecks"]) || !hash(input.selectionHash) || !uuid(input.batchId) || !revision(input.expectedDraftRevision)) throw new Error("Invalid batch");
  return { operation: value.operation, requestId, idempotencyKey: value.idempotencyKey, input: { ...position, selectionHash: input.selectionHash, batchId: input.batchId, expectedDraftRevision: input.expectedDraftRevision, targets: targets(input.targets, BULK_BATCH_SIZE), ...parseDecision(input) } };
}

function parseDecision(input: Record<string, unknown>): BulkDecision {
  const { category, answerEligible, rationale, exclusionChecks } = input;
  if (!(category === "common" || category === "regional" || category === "technical" || category === "less-common") || typeof answerEligible !== "boolean" || (answerEligible && category !== "common") || typeof rationale !== "string" || !rationale.trim() || [...rationale].length > 2000 || !record(exclusionChecks) || !exact(exclusionChecks, ["names", "abbreviations", "offensive", "malformed", "unverified"]) || !Object.values(exclusionChecks).every((value) => value === true)) throw new Error("Invalid decision");
  return { category, answerEligible, rationale, exclusionChecks: { names: true, abbreviations: true, offensive: true, malformed: true, unverified: true } };
}

export function parseBulkPage(value: unknown): BulkPage {
  if (!record(value) || !uuid(value.selectionId) || !hash(value.selectionHash) || !integer(value.count, 1, BULK_SELECTION_LIMIT) || !integer(value.offset, 0, value.count) || !integer(value.checkpoint, 0, value.count) || !revision(value.draftRevision) || !record(value.distribution) || !Array.isArray(value.items) || value.items.length !== Math.min(BULK_BATCH_SIZE, value.count - value.offset)) throw new Error("INVALID_RESPONSE");
  const distribution: Record<string, number> = {};
  for (const key of ["3", "5", "7", "9"]) {
    if (!integer(value.distribution[key], 0, value.count)) throw new Error("INVALID_RESPONSE");
    distribution[key] = value.distribution[key];
  }
  const items = value.items.map((row: unknown): BulkRow => {
    if (!record(row) || !uuid(row.entryId) || !integer(row.expectedEntryRevision, 1, 2147483647) || typeof row.original !== "string" || !(row.definitionVi === null || typeof row.definitionVi === "string") || !integer(row.level, 3, 9) || !reason(row.blocker) || !reason(row.answerBlocker) || typeof row.meaningWarning !== "boolean") throw new Error("INVALID_RESPONSE");
    return { entryId: row.entryId, expectedEntryRevision: row.expectedEntryRevision, original: row.original, definitionVi: row.definitionVi, level: row.level, blocker: row.blocker, answerBlocker: row.answerBlocker, meaningWarning: row.meaningWarning, result: row.result === null ? null : parseBulkItemResult(row.result) };
  });
  const totals = value.totals;
  if (!record(totals) || !integer(totals.applied, 0, value.count) || !integer(totals.unchanged, 0, value.count) || !integer(totals.conflict, 0, value.count) || !integer(totals.invalid, 0, value.count) || (value.decision !== null && !record(value.decision))) throw new Error("INVALID_RESPONSE");
  return { selectionId: value.selectionId, selectionHash: value.selectionHash, offset: value.offset, count: value.count, checkpoint: value.checkpoint, draftRevision: value.draftRevision, distribution, items, decision: value.decision === null ? null : parseDecision(value.decision), totals: { applied: totals.applied, unchanged: totals.unchanged, conflict: totals.conflict, invalid: totals.invalid } };
}

export function parseBulkReceipt(value: unknown): BulkReceipt {
  if (!record(value) || !uuid(value.batchId) || !revision(value.draftRevision) || !integer(value.checkpoint, 1, BULK_SELECTION_LIMIT) || !Array.isArray(value.items) || !integer(value.items.length, 1, BULK_BATCH_SIZE)) throw new Error("INVALID_RESPONSE");
  return { batchId: value.batchId, draftRevision: value.draftRevision, checkpoint: value.checkpoint, items: value.items.map(parseBulkItemResult) };
}

function parseBulkItemResult(item: unknown): BulkItemResult {
  if (!record(item) || !uuid(item.entryId) || !reason(item.reason) || !(item.status === "applied" || item.status === "unchanged" || item.status === "conflict" || item.status === "invalid")) throw new Error("INVALID_RESPONSE");
  return { entryId: item.entryId, status: item.status, reason: item.reason };
}
