export type Level = 3 | 5 | 7 | 9;

const LETTERS = new Set(Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZĐÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴ"));
const RAW_LETTERS = new Set([...LETTERS, ...Array.from([...LETTERS].join("").toLowerCase())]);
const COMBINING_MARKS = new Set(["\u0300", "\u0301", "\u0303", "\u0309", "\u0323", "\u0302", "\u0306", "\u031b"]);

export function normalizeSpelling(input: string): { normalized: string; level: number } {
  if (!Array.from(input).every((letter) => letter === " " || RAW_LETTERS.has(letter) || COMBINING_MARKS.has(letter))) {
    throw new Error("Unsupported spelling");
  }
  const original = input.normalize("NFC");
  if (!Array.from(original).every((letter) => letter === " " || RAW_LETTERS.has(letter))) {
    throw new Error("Unsupported spelling");
  }
  const normalized = original.toUpperCase();
  const compact = normalized.replaceAll(" ", "");
  return { normalized: compact, level: Array.from(compact).length };
}

export type Rights = { licenseName: string; licenseVersion: string | null; licenseUrl: string; attributionText: string; historyUrl: string | null; redistributionNote: string; modificationsNotice: string };
export type Source = { sourceId: string; name: string; kind: "kaikki" | "underthesea-resource"; artifactUrl: string; artifactSha256: string; resourceRevision: string; originDump: string | null; retrievedAt: string; rights: Rights };
export type Candidate = { externalId: string; sourceId: string; sourceEntryId: string; sourceSenseId: string | null; entryUrl: string; original: string; definitionVi: string | null; language: "vi"; sourceNotes: string | null };
export type ImportDocument = { schemaVersion: 1; normalizerVersion: "vi-nfc-v2"; artifactId: string; artifactRevision: string; preparedAt: string; chunkIndex: number; chunkCount: number; sources: Source[]; entries: Candidate[] };

type Field = "string" | "nullable" | "url" | "nullableUrl" | "uuid" | "hash" | "time";
function object(value: unknown, fields: Record<string, [Field, number?]>): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Expected object");
  const result = Object.fromEntries(Object.entries(value));
  if (Object.keys(result).length !== Object.keys(fields).length || Object.keys(fields).some((key) => !(key in result))) throw new Error("Invalid fields");
  for (const [key, [kind, limit]] of Object.entries(fields)) {
    const field = result[key];
    if ((kind === "nullable" || kind === "nullableUrl") && field === null) continue;
    if (typeof field !== "string" || (limit !== undefined && (Array.from(field).length > limit || new TextEncoder().encode(field).length > limit * 4))) throw new Error(`Invalid ${key}`);
    if ((kind === "url" || kind === "nullableUrl") && !/^https:\/\//.test(field)) throw new Error(`Invalid ${key}`);
    if ((kind === "url" || kind === "nullableUrl")) { try { if (new URL(field).protocol !== "https:") throw new Error(); } catch { throw new Error(`Invalid ${key}`); } }
    if (kind === "uuid" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(field)) throw new Error(`Invalid ${key}`);
    if (kind === "hash" && !/^[0-9a-f]{64}$/.test(field)) throw new Error(`Invalid ${key}`);
    if (kind === "time") {
      const match = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.\d+)?Z$/.exec(field);
      const parsed = new Date(field);
      if (!match || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 19) !== match[1]) throw new Error(`Invalid ${key}`);
    }
  }
  return result;
}
const rightsFields: Record<string, [Field, number?]> = { licenseName: ["string", 200], licenseVersion: ["nullable", 80], licenseUrl: ["url"], attributionText: ["string", 4000], historyUrl: ["nullableUrl"], redistributionNote: ["string", 4000], modificationsNotice: ["string", 2000] };

/** Validate a decoded offline document; trusted imports must revalidate raw JSON and reject duplicate keys. */
export function validateDocument(input: unknown, byteLength: number): void {
  if (byteLength > 512 * 1024) throw new Error("Chunk exceeds byte limit");
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new Error("Invalid document");
  const doc = Object.fromEntries(Object.entries(input));
  const expected = ["schemaVersion", "normalizerVersion", "artifactId", "artifactRevision", "preparedAt", "chunkIndex", "chunkCount", "sources", "entries"];
  if (Object.keys(doc).length !== expected.length || expected.some((key) => !(key in doc))) throw new Error("Invalid document fields");
  object({ artifactId: doc.artifactId, artifactRevision: doc.artifactRevision, preparedAt: doc.preparedAt }, { artifactId: ["uuid"], artifactRevision: ["string", 128], preparedAt: ["time"] });
  if (doc.schemaVersion !== 1 || doc.normalizerVersion !== "vi-nfc-v2" || !doc.artifactRevision || !Number.isInteger(doc.chunkCount) || typeof doc.chunkCount !== "number" || doc.chunkCount < 1 || doc.chunkCount > 100 || !Number.isInteger(doc.chunkIndex) || typeof doc.chunkIndex !== "number" || doc.chunkIndex < 0 || doc.chunkIndex >= doc.chunkCount) throw new Error("Invalid document metadata");
  if (!Array.isArray(doc.sources) || doc.sources.length > 20 || !Array.isArray(doc.entries) || doc.entries.length > 200) throw new Error("Invalid document bounds");
  const sourceIds = new Set<string>();
  for (const item of doc.sources) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) throw new Error("Invalid source");
    const { rights, ...rest } = item;
    const source = object(rest, { sourceId: ["uuid"], name: ["string", 120], kind: ["string"], artifactUrl: ["url"], artifactSha256: ["hash"], resourceRevision: ["string", 200], originDump: ["nullable"], retrievedAt: ["time"] });
    object(rights, rightsFields);
    if ((source.kind !== "kaikki" && source.kind !== "underthesea-resource") || typeof source.sourceId !== "string" || sourceIds.has(source.sourceId)) throw new Error("Invalid source identity");
    sourceIds.add(source.sourceId);
  }
  const identities = new Set<string>();
  for (const item of doc.entries) {
    const entry = object(item, { externalId: ["string", 200], sourceId: ["uuid"], sourceEntryId: ["string", 300], sourceSenseId: ["nullable", 300], entryUrl: ["url"], original: ["string", 120], definitionVi: ["nullable", 2000], language: ["string"], sourceNotes: ["nullable", 2000] });
    if (typeof entry.externalId !== "string" || !entry.externalId || typeof entry.sourceId !== "string" || !sourceIds.has(entry.sourceId) || typeof entry.original !== "string" || !entry.original || entry.definitionVi === "" || entry.language !== "vi") throw new Error("Invalid candidate");
    const identity = `${entry.sourceId}:${entry.externalId}`;
    if (identities.has(identity)) throw new Error("Duplicate candidate");
    identities.add(identity);
    if (![3, 5, 7, 9].includes(normalizeSpelling(entry.original).level)) throw new Error("Invalid candidate level");
  }
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(Reflect.get(value, key))}`).join(",")}}`;
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("Invalid JSON value");
  return encoded;
}
