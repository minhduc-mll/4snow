import { canonicalJson, normalizeSpelling, validateDocument } from "./dictionary-contract";
import { previewImport } from "./preview";
import { parseStrictJson, StrictJsonError } from "./strict-json";

const CHUNK_BYTES = 512 * 1024;
const MAX_CHUNKS = 100;
const MAX_ENTRIES_PER_CHUNK = 200;
const MAX_IMPORT_BYTES = MAX_CHUNKS * CHUNK_BYTES;
const encoder = new TextEncoder();

type ImportFile = Pick<File, "name" | "size" | "arrayBuffer">;
type ImportChunk = { document: Record<string, unknown>; canonicalHash: string; file: string };
type IssueCode = "file" | "json" | "metadata" | "source" | "entry" | "length" | "meaning" | "identity" | "collision" | "limit";
type ImportIssue = { file: string; part: number | null; entry: number | null; code: IssueCode; message: string; blocking: boolean; missingParts?: number[]; position?: { line: number; column: number } };
type PartSelection = { selected: number; expected: number; missing: number[] };
export type ImportPreflight = {
  artifactId: string;
  artifactRevision: string;
  entryCount: number;
  validCount: number;
  partSelection: PartSelection | null;
  chunks: ImportChunk[];
  issues: ImportIssue[];
};
type DocumentBase = { artifactId: string; artifactRevision: string; preparedAt: unknown; sources: unknown[]; schemaVersion: unknown; normalizerVersion: unknown };
type ParsedFile = { file: string; base: DocumentBase; entries: unknown[]; part: number | null; count: number | null };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseFile(text: string, file: string): ParsedFile {
  const value = parseStrictJson(text);
  if (!record(value)) throw new Error("Expected a JSON object");
  const { chunkIndex, chunkCount, entries, ...base } = value;
  if (!Array.isArray(entries) || !Array.isArray(base.sources) || typeof base.artifactId !== "string" || typeof base.artifactRevision !== "string") throw new Error("Invalid import metadata or entries");
  const split = chunkIndex !== undefined || chunkCount !== undefined;
  if (split && (typeof chunkIndex !== "number" || !Number.isInteger(chunkIndex) || typeof chunkCount !== "number" || !Number.isInteger(chunkCount) || chunkIndex < 0 || chunkIndex >= chunkCount || chunkCount > MAX_CHUNKS)) throw new Error("Invalid part index or count");
  const part = typeof chunkIndex === "number" ? chunkIndex : null;
  const count = typeof chunkCount === "number" ? chunkCount : null;
  validateDocument({ ...base, entries: [], chunkIndex: part ?? 0, chunkCount: count ?? 1 }, 0);
  return { file, base: { artifactId: base.artifactId, artifactRevision: base.artifactRevision, preparedAt: base.preparedAt, sources: base.sources, schemaVersion: base.schemaVersion, normalizerVersion: base.normalizerVersion }, entries, part, count };
}

function splitEntries(file: ParsedFile, issues: ImportIssue[]): Record<string, unknown>[] {
  const base = file.base;
  const reserve = encoder.encode(JSON.stringify({ ...base, entries: [], chunkIndex: 99, chunkCount: 100 })).length;
  const groups: unknown[][] = [];
  let group: unknown[] = [];
  let bytes = reserve;
  for (const [index, entry] of file.entries.entries()) {
    const entryBytes = encoder.encode(JSON.stringify(entry)).length;
    if (reserve + entryBytes > CHUNK_BYTES) {
      issues.push({ file: file.file, part: null, entry: index + 1, code: "limit", message: "Entry exceeds the UTF-8 chunk limit", blocking: true });
      continue;
    }
    if (group.length >= MAX_ENTRIES_PER_CHUNK || bytes + entryBytes + (group.length ? 1 : 0) > CHUNK_BYTES) {
      groups.push(group);
      group = [];
      bytes = reserve;
    }
    bytes += entryBytes + (group.length ? 1 : 0);
    group.push(entry);
  }
  if (group.length) groups.push(group);
  if (groups.length > MAX_CHUNKS) {
    issues.push({ file: file.file, part: null, entry: null, code: "limit", message: "Dataset exceeds 100 chunks per session", blocking: true });
    return [];
  }
  return groups.map((entries, chunkIndex) => ({ ...base, entries, chunkIndex, chunkCount: groups.length }));
}

export async function preflightImport(files: readonly ImportFile[]): Promise<ImportPreflight> {
  const result: ImportPreflight = { artifactId: "", artifactRevision: "", entryCount: 0, validCount: 0, partSelection: null, chunks: [], issues: [] };
  if (!files.length || files.length > MAX_CHUNKS || files.reduce((bytes, file) => bytes + file.size, 0) > MAX_IMPORT_BYTES) {
    result.issues.push({ file: "", part: null, entry: null, code: "limit", message: "Selection exceeds the limits of one import session", blocking: true });
    return result;
  }
  const parsed: ParsedFile[] = [];
  for (const file of files) {
    let text: string | undefined;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      parsed.push(parseFile(text, file.name));
    } catch (error) {
      const issue: ImportIssue = {
        file: file.name, part: null, entry: null, code: error instanceof StrictJsonError ? "json" : text === undefined ? "file" : "metadata",
        message: error instanceof Error ? error.message : "Cannot read JSON", blocking: true,
      };
      if (error instanceof StrictJsonError && text !== undefined) {
        const lines = text.slice(0, error.offset).split(/\r\n|\n|\r/);
        issue.position = { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
      }
      result.issues.push(issue);
    }
  }
  const first = parsed[0];
  if (!first) return result;
  result.artifactId = first.base.artifactId;
  result.artifactRevision = first.base.artifactRevision;
  const explicitParts = first.count !== null;
  if (first.count !== null) {
    const parts = new Set(parsed.filter((item) =>
      item.count === first.count && item.base.artifactId === first.base.artifactId && item.base.artifactRevision === first.base.artifactRevision
    ).map((item) => item.part));
    const missing = Array.from({ length: first.count }, (_, index) => index).filter((index) => !parts.has(index)).map((index) => index + 1);
    result.partSelection = { selected: parts.size, expected: first.count, missing };
  }
  if (result.partSelection
    ? files.length !== result.partSelection.expected || result.partSelection.missing.length > 0
    : files.length !== 1) {
    result.issues.push({
      file: first.file, part: null, entry: null, code: "metadata", message: "Select one complete JSON or all uniquely indexed parts of the same artifact", blocking: true,
      ...(result.partSelection?.missing.length ? { missingParts: result.partSelection.missing } : {}),
    });
  }
  const spellings = new Set<string>();
  const meanings = new Set<string>();
  const identities = new Set<string>();
  const sources = new Map<string, string>();
  const sourceReferences = new Map<string, string>();
  for (const item of parsed) {
    const location = { file: item.file, part: item.part === null ? null : item.part + 1 };
    if (item.base.artifactId !== result.artifactId || item.base.artifactRevision !== result.artifactRevision) result.issues.push({ ...location, entry: null, code: "metadata", message: "Artifact ID or revision differs from the first file", blocking: true });
    const localSources = new Map<string, { identity: string; source: unknown }>();
    for (const source of item.base.sources) {
      if (!record(source) || typeof source.sourceId !== "string") continue;
      const identity = canonicalJson([source.kind, source.resourceRevision, source.artifactSha256]);
      const { sourceId, ...fields } = source;
      const metadata = canonicalJson(fields);
      const previous = sources.get(identity);
      const previousReference = sourceReferences.get(sourceId);
      if ((previous !== undefined && previous !== metadata) || (previousReference !== undefined && previousReference !== identity)) result.issues.push({ ...location, entry: null, code: "source", message: "Source metadata differs between parts", blocking: true });
      sources.set(identity, metadata);
      sourceReferences.set(sourceId, identity);
      localSources.set(sourceId, { identity, source });
    }
    result.entryCount += item.entries.length;
    if (item.part !== null && (item.entries.length > MAX_ENTRIES_PER_CHUNK || encoder.encode(JSON.stringify({ ...item.base, entries: item.entries, chunkIndex: item.part, chunkCount: item.count })).length > CHUNK_BYTES)) {
      result.issues.push({ ...location, entry: null, code: "limit", message: "Part exceeds the entry or UTF-8 byte limit", blocking: true });
    }
    for (const [index, entry] of item.entries.entries()) {
      const issue = (code: IssueCode, message: string, blocking = true) => result.issues.push({ ...location, entry: index + 1, code, message, blocking });
      if (!record(entry) || typeof entry.original !== "string" || typeof entry.externalId !== "string") {
        issue("entry", "Invalid candidate");
        continue;
      }
      if (entry.definitionVi === null || (typeof entry.definitionVi === "string" && !entry.definitionVi.trim())) issue("meaning", "Missing Vietnamese definition", false);
      const source = typeof entry.sourceId === "string" ? localSources.get(entry.sourceId) : undefined;
      if (!source) {
        issue("source", "Missing source reference");
        continue;
      }
      try {
        const { normalized, level } = normalizeSpelling(entry.original);
        if (![3, 5, 7, 9].includes(level)) {
          issue("length", "Unsupported letter count");
          continue;
        }
        validateDocument({ ...item.base, sources: [source.source], entries: [entry], chunkIndex: 0, chunkCount: 1 }, 0);
        const identity = canonicalJson([source.identity, entry.externalId]);
        if (identities.has(identity)) {
          issue("identity", "Duplicate candidate identity");
          continue;
        }
        const meaning = canonicalJson([normalized, entry.definitionVi]);
        if (spellings.has(normalized)) issue("collision", meanings.has(meaning) ? "Repeated spelling and definition" : "Repeated spelling", false);
        identities.add(identity);
        spellings.add(normalized);
        meanings.add(meaning);
        result.validCount++;
      } catch (error) {
        issue("entry", error instanceof Error ? error.message : "Invalid candidate");
      }
    }
  }
  if (!result.entryCount) result.issues.push({ file: first.file, part: null, entry: null, code: "entry", message: "Dataset has no candidates", blocking: true });
  if (result.issues.some((issue) => issue.blocking)) return result;
  const documents = explicitParts
    ? parsed.sort((a, b) => (a.part ?? 0) - (b.part ?? 0)).map((item) => ({ ...item.base, chunkIndex: item.part, chunkCount: item.count, entries: item.entries }))
    : splitEntries(first, result.issues);
  if (result.issues.some((issue) => issue.blocking)) return result;
  for (const [index, document] of documents.entries()) {
    const preview = await previewImport(JSON.stringify(document));
    const file = explicitParts ? parsed[index]?.file ?? first.file : first.file;
    if (!preview.valid || !preview.canonicalHash) {
      result.issues.push({ file, part: index + 1, entry: null, code: "entry", message: preview.errors[0]?.message ?? "Cannot validate part", blocking: true });
      return result;
    }
    result.chunks.push({ document, canonicalHash: preview.canonicalHash, file });
  }
  return result;
}
