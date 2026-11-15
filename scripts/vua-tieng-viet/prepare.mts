import { createHash } from "node:crypto";
import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { canonicalJson, normalizeSpelling, validateDocument } from "../../lib/vua-tieng-viet/dictionary-contract.ts";
import type { Candidate, ImportDocument, Source } from "../../lib/vua-tieng-viet/dictionary-contract.ts";

try {
const root = "data/vua-tieng-viet";
const hash = "1f0abd21982660b5fc2eff5eb3fbacbed2d9fe8f476af794dbed0d927ffb8187";
const path = `${root}/kaikki-${hash}.jsonl.gz`;
const digest = createHash("sha256").update(readFileSync(path)).digest("hex");
if (digest !== hash) throw new Error("Extraction hash mismatch");
const sourceId = "a4711100-9682-45fd-8fa8-154b7ac0967c";
const source: Source = {
  sourceId, name: "Kaikki Vietnamese Wiktionary raw extraction", kind: "kaikki",
  artifactUrl: "https://kaikki.org/viwiktionary/raw-wiktextract-data.jsonl.gz", artifactSha256: hash,
  resourceRevision: "2026-11-03; wiktextract 19f9a30; wikitextprocessor 6f96ddf", originDump: "viwiktionary-20261002",
  retrievedAt: "2026-11-08T09:25:37Z", rights: {
    licenseName: "Creative Commons Attribution-ShareAlike", licenseVersion: "4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    attributionText: "Wiktionary contributors; extracted by Kaikki.org using Wiktextract. See each entry and its history for contributors.",
    historyUrl: "https://vi.wiktionary.org/wiki/", redistributionNote: "UNRESOLVED: qualified review of applicable terms, attribution and share-alike compliance is required before publication.",
    modificationsNotice: "Entries and senses selected and transformed into JSON; spelling and gloss retained. See source records."
  }
};
const counts = new Map([[3, 0], [5, 0], [7, 0], [9, 0]]);
const entries: Candidate[] = [];
let lineNumber = 0;
for await (const line of createInterface({ input: createReadStream(path).pipe(createGunzip()), crlfDelay: Infinity })) {
  lineNumber++;
  const row: unknown = JSON.parse(line);
  if (typeof row !== "object" || row === null || !("lang_code" in row) || row.lang_code !== "vi" || !("word" in row) || typeof row.word !== "string" || row.word !== row.word.toLowerCase() || ("pos" in row && row.pos === "name") || !("senses" in row) || !Array.isArray(row.senses)) continue;
  let level;
  try { level = normalizeSpelling(row.word).level; } catch { continue; }
  if (!counts.has(level) || (counts.get(level) ?? 3) >= 3) continue;
  for (let senseIndex = 0; senseIndex < row.senses.length; senseIndex++) {
    const sense: unknown = row.senses[senseIndex];
    if (typeof sense !== "object" || sense === null || !("glosses" in sense) || !Array.isArray(sense.glosses) || typeof sense.glosses[0] !== "string" || !sense.glosses[0] || Array.from(sense.glosses[0]).length > 2000) continue;
    const entryUrl = `https://vi.wiktionary.org/wiki/${encodeURIComponent(row.word.replaceAll(" ", "_"))}`;
    entries.push({ externalId: `line:${lineNumber}:sense:${senseIndex}`, sourceId, sourceEntryId: `jsonl-line:${lineNumber}`, sourceSenseId: `sense-index:${senseIndex}`, entryUrl, original: row.word, definitionVi: sense.glosses[0], language: "vi", sourceNotes: `Unreviewed source sense; not approved for publication. Contributor history: ${entryUrl}?action=history` });
    counts.set(level, (counts.get(level) ?? 0) + 1);
    break;
  }
  if ([...counts.values()].every((count) => count === 3)) break;
}
if ([...counts.values()].some((count) => count !== 3)) throw new Error("Missing candidate level");
const doc: ImportDocument = { schemaVersion: 1, normalizerVersion: "vi-nfc-v2", artifactId: "78b9536a-5fe6-4849-a2c1-51a922ff8de7", artifactRevision: hash, preparedAt: "2026-11-08T09:37:25.245Z", chunkIndex: 0, chunkCount: 1, sources: [source], entries };
const text = JSON.stringify(doc, null, 2) + "\n";
validateDocument(doc, Buffer.byteLength(text));
writeFileSync(`${root}/candidates-000.json`, text);
writeFileSync(`${root}/candidates-000.canonical.sha256`, `${createHash("sha256").update(canonicalJson(doc)).digest("hex")}  candidates-000.json\n`);
} catch (error) {
  throw new Error("Offline source preparation failed", { cause: error });
}
