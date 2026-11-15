export type CollisionAlternative = { entryId: string; revisionId: string; revisionNumber: number; original: string; definitionVi: string | null; review: string; eligible: boolean; sourceName: string; sourceEntryId: string; sourceSenseId: string | null; entryUrl: string };
export type CollisionPage = { items: CollisionAlternative[]; nextCursor: string | null; selectedRevisionId: string | null; answerRevisionId: string | null; unresolved: boolean; eligibleCount: number; draftRevision: string };
function rec(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function nullable(value: unknown): value is string | null { return value === null || typeof value === "string"; }
export function parseCollisionPage(value: unknown): CollisionPage {
  if (!rec(value) || !Array.isArray(value.items) || value.items.length > 50 || !nullable(value.nextCursor) || !nullable(value.selectedRevisionId) || !nullable(value.answerRevisionId) || typeof value.unresolved !== "boolean" || typeof value.eligibleCount !== "number" || !Number.isSafeInteger(value.eligibleCount) || value.eligibleCount < 0 || typeof value.draftRevision !== "string") throw new Error("INVALID_RESPONSE");
  const items = value.items.map((item: unknown): CollisionAlternative => {
    if (!rec(item) || typeof item.entryId !== "string" || typeof item.revisionId !== "string" || typeof item.revisionNumber !== "number" || typeof item.original !== "string" || !nullable(item.definitionVi) || typeof item.review !== "string" || typeof item.eligible !== "boolean" || typeof item.sourceName !== "string" || typeof item.sourceEntryId !== "string" || !nullable(item.sourceSenseId) || typeof item.entryUrl !== "string") throw new Error("INVALID_RESPONSE");
    return { entryId: item.entryId, revisionId: item.revisionId, revisionNumber: item.revisionNumber, original: item.original, definitionVi: item.definitionVi, review: item.review, eligible: item.eligible, sourceName: item.sourceName, sourceEntryId: item.sourceEntryId, sourceSenseId: item.sourceSenseId, entryUrl: item.entryUrl };
  });
  return { items, nextCursor: value.nextCursor, selectedRevisionId: value.selectedRevisionId, answerRevisionId: value.answerRevisionId, unresolved: value.unresolved, eligibleCount: value.eligibleCount, draftRevision: value.draftRevision };
}
