import { canonicalJson, normalizeSpelling, validateDocument } from "./dictionary-contract.ts";
import { parseStrictJson } from "./strict-json.ts";

export type PreviewResult = {
  valid: boolean;
  entryCount: number;
  collisionCount: number;
  duplicateCount: number;
  conflictCount: number;
  canonicalHash: string | null;
  errors: { field: string; message: string }[];
  errorsTruncated: boolean;
};

export async function previewImport(text: string): Promise<PreviewResult> {
  try {
    const byteLength = new TextEncoder().encode(text).length;
    if (byteLength > 512 * 1024) throw new Error("Chunk exceeds byte limit");
    const document = parseStrictJson(text);
    if (typeof document !== "object" || document === null || !("entries" in document) || !Array.isArray(document.entries)) throw new Error("Invalid entries");
    if (document.entries.length > 200) throw new Error("Invalid document bounds");
    const base = { ...document, entries: [] };
    validateDocument(base, byteLength);
    if (!("sources" in document) || !Array.isArray(document.sources)) throw new Error("Invalid sources");
    const sources = new Map<string, { source: unknown; identity: string }>();
    for (const source of document.sources) {
      if (typeof source !== "object" || source === null || !("sourceId" in source) || typeof source.sourceId !== "string" || !("kind" in source) || typeof source.kind !== "string" || !("resourceRevision" in source) || typeof source.resourceRevision !== "string" || !("artifactSha256" in source) || typeof source.artifactSha256 !== "string") throw new Error("Invalid source");
      sources.set(source.sourceId, { source, identity: JSON.stringify([source.kind, source.resourceRevision, source.artifactSha256]) });
    }
    const spellings = new Set<string>();
    const identities = new Map<string, string>();
    const errors: PreviewResult["errors"] = [];
    let errorCount = 0;
    let collisionCount = 0;
    let duplicateCount = 0;
    let conflictCount = 0;
    for (const [index, entry] of document.entries.entries()) {
      try {
        if (typeof entry !== "object" || entry === null || !("original" in entry) || typeof entry.original !== "string" || !("sourceId" in entry) || typeof entry.sourceId !== "string" || !("externalId" in entry) || typeof entry.externalId !== "string") throw new Error("Invalid entry");
        const source = sources.get(entry.sourceId);
        validateDocument({ ...base, sources: source ? [source.source] : [], entries: [entry] }, byteLength);
        if (!source) throw new Error("Invalid source");
        const identity = JSON.stringify([source.identity, entry.externalId]);
        const contents = canonicalJson({ ...entry, sourceId: source.identity });
        const previous = identities.get(identity);
        if (previous !== undefined) {
          if (previous === contents) duplicateCount++;
          else conflictCount++;
          throw new Error("Duplicate candidate identity");
        }
        identities.set(identity, contents);
        const spelling = normalizeSpelling(entry.original).normalized;
        if (spellings.has(spelling)) collisionCount++;
        spellings.add(spelling);
      } catch (error) {
        errorCount++;
        if (errors.length < 100) errors.push({ field: `entries[${index}]`, message: error instanceof Error ? error.message : "Invalid entry" });
      }
    }
    if (errorCount > 0) return { valid: false, entryCount: document.entries.length, collisionCount, duplicateCount, conflictCount, canonicalHash: null, errors, errorsTruncated: errorCount > 100 };
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(document)));
    const canonicalHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    return { valid: true, entryCount: document.entries.length, collisionCount, duplicateCount, conflictCount, canonicalHash, errors: [], errorsTruncated: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid import";
    return { valid: false, entryCount: 0, collisionCount: 0, duplicateCount: 0, conflictCount: 0, canonicalHash: null, errors: [{ field: "document", message }], errorsTruncated: false };
  }
}
