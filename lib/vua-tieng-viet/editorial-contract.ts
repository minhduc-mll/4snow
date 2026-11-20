import { normalizeSpelling } from "./dictionary-contract.ts";
import { isRevision } from "./publication-contract.ts";

export type ReviewStatus = "pending" | "approved" | "rejected" | "withdrawn";
export type Category = "common" | "regional" | "technical" | "less-common" | "excluded";
export type ExclusionChecks = { names: boolean; abbreviations: boolean; offensive: boolean; malformed: boolean; unverified: boolean };
export type ReviewInput = { entryId: string; expectedEntryRevision: number; expectedDraftRevision: string; original: string; definitionVi: string | null; review: ReviewStatus; answerEligible: boolean; category: Category; rationale: string; exclusionChecks: ExclusionChecks; meaningWarningAcknowledged?: true };
export type Filters = { sourceId: string | null; level: 3 | 5 | 7 | 9 | null; review: ReviewStatus | null; hasDefinition: boolean | null; collisionsOnly: boolean; spelling?: string };
export type CreateCandidateInput = { original: string; definitionVi: string | null; sourceId: string; entryUrl: string | null; sourceEntryId: string | null; sourceSenseId: string | null; allowAlternateMeaning: boolean; expectedDraftRevision: string };
export type RightsDecision = "cleared" | "unresolved" | "rejected";
export type RightsReviewInput = { sourceId: string; expectedDraftRevision: string; decision: RightsDecision; evidence: string; obligations: string };
export type SelectAnswerInput = { normalized: string; level: 3 | 5 | 7 | 9; entryRevisionId: string; expectedDraftRevision: string };
export type EditorialRequest =
  | { operation: "create-candidate"; requestId: string; idempotencyKey: string; input: CreateCandidateInput }
  | { operation: "candidate-sources"; requestId: string; input: { cursor: string | null } }
  | { operation: "select-answer"; requestId: string; idempotencyKey: string; input: SelectAnswerInput }
  | { operation: "collision"; requestId: string; input: { normalized: string; level: 3 | 5 | 7 | 9; cursor: string | null; limit: number } }
  | { operation: "rights-review"; requestId: string; idempotencyKey: string; input: RightsReviewInput }
  | { operation: "list"; requestId: string; input: { filters: Filters; cursor: string | null; limit: number } }
  | { operation: "detail"; requestId: string; input: { entryId: string } }
  | { operation: "list-history"; requestId: string; input: { entryId: string; cursor: string | null; limit: number } }
  | { operation: "review"; requestId: string; idempotencyKey: string; input: ReviewInput };

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function keys(value: Record<string, unknown>, expected: string[]): boolean { return Object.keys(value).length === expected.length && expected.every((key) => Object.hasOwn(value, key)); }
function uuid(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value); }
function bounded(value: unknown, limit: number): value is string { return typeof value === "string" && Array.from(value).length <= limit && new TextEncoder().encode(value).length <= limit * 4; }
export function isReviewStatus(value: unknown): value is ReviewStatus { return value === "pending" || value === "approved" || value === "rejected" || value === "withdrawn"; }
function category(value: unknown): value is Category { return value === "common" || value === "regional" || value === "technical" || value === "less-common" || value === "excluded"; }
function cursor(value: unknown): value is string | null { return value === null || (bounded(value, 512) && value.length > 0); }
function optionalText(value: unknown, limit: number): value is string | null { return value === null || (bounded(value, limit) && value.trim().length > 0); }

function optionalHttps(value: unknown): value is string | null {
  if (value === null) return true;
  if (!bounded(value, 2048) || !value.startsWith("https://") || /\s/.test(value)) return false;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }
  catch { return false; }
}

export function hasMeaningWarning(definition: string): boolean {
  return /(^|[^\p{L}])(?:hiếm|cổ|địa phương)([^\p{L}]|$)/iu.test(definition.normalize("NFC"));
}

export function parseEditorialRequest(value: unknown): EditorialRequest {
  if (!record(value) || !uuid(value.requestId) || !record(value.input)) throw new Error("Invalid request");
  const input = value.input;
  if (value.operation === "create-candidate") {
    if (!keys(value, ["operation", "requestId", "idempotencyKey", "input"]) || !uuid(value.idempotencyKey)
      || !keys(input, ["original", "definitionVi", "sourceId", "entryUrl", "sourceEntryId", "sourceSenseId", "allowAlternateMeaning", "expectedDraftRevision"])
      || !bounded(input.original, 120) || !optionalText(input.definitionVi, 2000) || !uuid(input.sourceId)
      || !optionalHttps(input.entryUrl) || !optionalText(input.sourceEntryId, 300) || !optionalText(input.sourceSenseId, 300)
      || typeof input.allowAlternateMeaning !== "boolean" || !isRevision(input.expectedDraftRevision)) throw new Error("Invalid candidate");
    if (![3, 5, 7, 9].includes(normalizeSpelling(input.original).level)) throw new Error("Invalid candidate spelling");
    const original = input.original.trim().normalize("NFC");
    return { operation: "create-candidate", requestId: value.requestId, idempotencyKey: value.idempotencyKey, input: {
      original, definitionVi: input.definitionVi, sourceId: input.sourceId, entryUrl: input.entryUrl,
      sourceEntryId: input.sourceEntryId, sourceSenseId: input.sourceSenseId, allowAlternateMeaning: input.allowAlternateMeaning, expectedDraftRevision: input.expectedDraftRevision,
    } };
  }
  if (value.operation === "candidate-sources") {
    if (!keys(value, ["operation", "requestId", "input"]) || !keys(input, ["cursor"]) || !cursor(input.cursor)) throw new Error("Invalid source request");
    return { operation: "candidate-sources", requestId: value.requestId, input: { cursor: input.cursor } };
  }
  if (value.operation === "select-answer" || value.operation === "collision") {
    if (!bounded(input.normalized, 9) || !(input.level === 3 || input.level === 5 || input.level === 7 || input.level === 9)) throw new Error("Invalid spelling");
    const spelling = normalizeSpelling(input.normalized);
    if (spelling.normalized !== input.normalized || spelling.level !== input.level) throw new Error("Invalid spelling");
    if (value.operation === "select-answer") {
      if (!keys(value, ["operation", "requestId", "idempotencyKey", "input"]) || !uuid(value.idempotencyKey) || !keys(input, ["normalized", "level", "entryRevisionId", "expectedDraftRevision"]) || !uuid(input.entryRevisionId) || typeof input.expectedDraftRevision !== "string" || !/^(0|[1-9][0-9]{0,18})$/.test(input.expectedDraftRevision) || BigInt(input.expectedDraftRevision) > BigInt("9223372036854775807")) throw new Error("Invalid selection");
      return { operation: "select-answer", requestId: value.requestId, idempotencyKey: value.idempotencyKey, input: { normalized: input.normalized, level: input.level, entryRevisionId: input.entryRevisionId, expectedDraftRevision: input.expectedDraftRevision } };
    }
    if (!keys(value, ["operation", "requestId", "input"]) || !keys(input, ["normalized", "level", "cursor", "limit"]) || !cursor(input.cursor) || typeof input.limit !== "number" || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 50) throw new Error("Invalid collision page");
    return { operation: "collision", requestId: value.requestId, input: { normalized: input.normalized, level: input.level, cursor: input.cursor, limit: input.limit } };
  }
  if (value.operation === "rights-review") {
    if (!keys(value, ["operation", "requestId", "idempotencyKey", "input"]) || !uuid(value.idempotencyKey) || !keys(input, ["sourceId", "expectedDraftRevision", "decision", "evidence", "obligations"]) || !uuid(input.sourceId) || typeof input.expectedDraftRevision !== "string" || !/^(0|[1-9][0-9]{0,18})$/.test(input.expectedDraftRevision) || BigInt(input.expectedDraftRevision) > BigInt("9223372036854775807") || !(input.decision === "cleared" || input.decision === "unresolved" || input.decision === "rejected") || !bounded(input.evidence, 4000) || !input.evidence.trim() || !bounded(input.obligations, 4000) || !input.obligations.trim()) throw new Error("Invalid rights review");
    return { operation: "rights-review", requestId: value.requestId, idempotencyKey: value.idempotencyKey, input: { sourceId: input.sourceId, expectedDraftRevision: input.expectedDraftRevision, decision: input.decision, evidence: input.evidence, obligations: input.obligations } };
  }
  if (value.operation === "review") {
    const fields = ["entryId", "expectedEntryRevision", "expectedDraftRevision", "original", "definitionVi", "review", "answerEligible", "category", "rationale", "exclusionChecks"];
    const acknowledged = input.meaningWarningAcknowledged === true;
    if (!keys(value, ["operation", "requestId", "idempotencyKey", "input"]) || !uuid(value.idempotencyKey) || !keys(input, acknowledged ? [...fields, "meaningWarningAcknowledged"] : fields) || !uuid(input.entryId) || typeof input.expectedEntryRevision !== "number" || !Number.isSafeInteger(input.expectedEntryRevision) || input.expectedEntryRevision < 1 || input.expectedEntryRevision > 2147483647 || typeof input.expectedDraftRevision !== "string" || !/^(0|[1-9][0-9]{0,18})$/.test(input.expectedDraftRevision) || BigInt(input.expectedDraftRevision) > BigInt("9223372036854775807") || !bounded(input.original, 120) || !input.original || !(input.definitionVi === null || (bounded(input.definitionVi, 2000) && input.definitionVi.trim().length > 0)) || !isReviewStatus(input.review) || typeof input.answerEligible !== "boolean" || !category(input.category) || !bounded(input.rationale, 2000) || !record(input.exclusionChecks) || !keys(input.exclusionChecks, ["names", "abbreviations", "offensive", "malformed", "unverified"])) throw new Error("Invalid review");
    const c = input.exclusionChecks;
    if (typeof c.names !== "boolean" || typeof c.abbreviations !== "boolean" || typeof c.offensive !== "boolean" || typeof c.malformed !== "boolean" || typeof c.unverified !== "boolean") throw new Error("Invalid exclusion checks");
    const normalized = normalizeSpelling(input.original);
    if (![3, 5, 7, 9].includes(normalized.level)) throw new Error("Invalid level");
    if (input.review === "approved" && (!c.names || !c.abbreviations || !c.offensive || !c.malformed || !c.unverified || input.category === "excluded" || !input.rationale.trim())) throw new Error("Approval requires exclusion checks");
    if (input.answerEligible && (input.review !== "approved" || input.category !== "common" || input.definitionVi === null || !input.rationale.trim())) throw new Error("Answer requires a reviewed meaning");
    if (input.answerEligible && input.definitionVi !== null && hasMeaningWarning(input.definitionVi) && !acknowledged) throw new Error("Answer needs explicit meaning review");
    return { operation: "review", requestId: value.requestId, idempotencyKey: value.idempotencyKey, input: { entryId: input.entryId, expectedEntryRevision: input.expectedEntryRevision, expectedDraftRevision: input.expectedDraftRevision, original: input.original, definitionVi: input.definitionVi, review: input.review, answerEligible: input.answerEligible, category: input.category, rationale: input.rationale, ...(acknowledged ? { meaningWarningAcknowledged: true } : {}), exclusionChecks: { names: c.names, abbreviations: c.abbreviations, offensive: c.offensive, malformed: c.malformed, unverified: c.unverified } } };
  }
  if (!keys(value, ["operation", "requestId", "input"])) throw new Error("Invalid request");
  if (value.operation === "detail") {
    if (!keys(input, ["entryId"]) || !uuid(input.entryId)) throw new Error("Invalid detail");
    return { operation: "detail", requestId: value.requestId, input: { entryId: input.entryId } };
  }
  if (value.operation === "list-history") {
    if (!keys(input, ["entryId", "cursor", "limit"]) || !uuid(input.entryId) || !cursor(input.cursor) || typeof input.limit !== "number" || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 50) throw new Error("Invalid history");
    return { operation: "list-history", requestId: value.requestId, input: { entryId: input.entryId, cursor: input.cursor, limit: input.limit } };
  }
  if (value.operation === "list") {
    const filterKeys = ["sourceId", "level", "review", "hasDefinition", "collisionsOnly"];
    if (!(keys(input, ["filters", "cursor", "limit"]) || keys(input, ["filters", "cursor"])) || !record(input.filters) || !(keys(input.filters, filterKeys) || keys(input.filters, [...filterKeys, "spelling"])) || !cursor(input.cursor)) throw new Error("Invalid list");
    const limit = input.limit === undefined ? 50 : input.limit;
    if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid list");
    const f = input.filters;
    if (!(f.sourceId === null || uuid(f.sourceId)) || !(f.level === null || f.level === 3 || f.level === 5 || f.level === 7 || f.level === 9) || !(f.review === null || isReviewStatus(f.review)) || !(f.hasDefinition === null || typeof f.hasDefinition === "boolean") || typeof f.collisionsOnly !== "boolean" || !(f.spelling === undefined || bounded(f.spelling, 120))) throw new Error("Invalid filters");
    const spelling = f.spelling ? normalizeSpelling(f.spelling).normalized : "";
    return { operation: "list", requestId: value.requestId, input: { filters: { sourceId: f.sourceId, level: f.level, review: f.review, hasDefinition: f.hasDefinition, collisionsOnly: f.collisionsOnly, ...(spelling ? { spelling } : {}) }, cursor: input.cursor, limit } };
  }
  throw new Error("Unsupported operation");
}
