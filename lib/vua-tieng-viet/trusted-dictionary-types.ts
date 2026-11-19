import type { ImportMutation, VerifiedChunk } from "./import-contract.ts";
import type { EditorialRequest } from "./editorial-contract.ts";
import type { CursorPosition } from "./editorial-cursor.ts";
import type { PublicationRequest } from "./publication-contract.ts";
export type ImportErrorCode = "INVALID_INPUT" | "NOT_FOUND" | "IDEMPOTENCY_CONFLICT" | "IMPORT_CONFLICT" | "REVISION_CONFLICT" | "RELEASE_INCOMPLETE";
export type ImportConflictReason = "ARTIFACT_MISMATCH" | "CHUNK_HASH_MISMATCH" | "IMPORT_NOT_STAGING" | "ARTIFACT_LIMIT" | "MISSING_CHUNKS" | "SOURCE_METADATA_MISMATCH" | "DUPLICATE_IDENTITY" | "SOURCE_REFERENCE" | "CANDIDATE_CONTENT_MISMATCH";
export type ImportConflictLocation = { chunkIndex: number; entryIndex?: number };
export class ImportOperationError extends Error {
  readonly code: ImportErrorCode;
  readonly reason: ImportConflictReason | undefined;
  readonly location: ImportConflictLocation | undefined;
  constructor(code: ImportErrorCode, reason?: ImportConflictReason, location?: ImportConflictLocation) { super(code); this.code = code; this.reason = reason; this.location = location; }
}
type EditorialRead = Exclude<EditorialRequest, { operation: "review" | "rights-review" | "select-answer" }>;
type EditorialReview = Extract<EditorialRequest, { operation: "review" }>;
import type { BulkRequest } from "./bulk-review-contract.ts";
export type PreviewDependencies = { bulkReview?: (request: BulkRequest, requestHash: string) => Promise<unknown>; publication?: (request: PublicationRequest, requestHash: string) => Promise<unknown>; consumePublicationLimit?: () => Promise<number>; selectAnswer?: (request: Extract<EditorialRequest, { operation: "select-answer" }>, requestHash: string) => Promise<unknown>; secret: string; origins: string[]; now: () => number; consumeLimit: () => Promise<number>; consumeImportLimit?: () => Promise<number>; consumeMutationLimit?: () => Promise<number>; consumeReadLimit?: () => Promise<number>; mutate?: (mutation: ImportMutation, requestHash: string, verified: VerifiedChunk | null) => Promise<unknown>; editorialRead?: (request: EditorialRead, position: CursorPosition | null) => Promise<unknown>; editorialReview?: (request: EditorialReview, requestHash: string, normalized: { normalized: string; level: number }) => Promise<unknown>; rightsReview?: (request: Extract<EditorialRequest, { operation: "rights-review" }>, requestHash: string) => Promise<unknown> };
