import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSpelling } from "../../lib/vua-tieng-viet/dictionary-contract.ts";

test("normalization preserves accents, folds canonical equivalents and counts letters", () => {
  assert.deepEqual(normalizeSpelling("tiếng Việt"), { normalized: "TIẾNGVIỆT", level: 9 });
  assert.notEqual(normalizeSpelling("đê").normalized, normalizeSpelling("de").normalized);
  assert.throws(() => normalizeSpelling("abc!"));
});

test("normalization rejects unsupported input instead of expanding it", () => {
  for (const input of ["ß", "ı", "ſ", "Kim", "a\tb", "a1b", "abc😀", "å"]) assert.throws(() => normalizeSpelling(input));
});

test("canonical JSON has a stable independent SHA-256", async () => {
  const { canonicalJson } = await import("../../lib/vua-tieng-viet/dictionary-contract.ts");
  const { createHash } = await import("node:crypto");
  assert.equal(createHash("sha256").update(canonicalJson({ b: 2, a: 1 })).digest("hex"), "43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777");
});

test("generated candidate chunk validates and covers all levels", async () => {
  const { validateDocument, normalizeSpelling } = await import("../../lib/vua-tieng-viet/dictionary-contract.ts");
  const { readFileSync } = await import("node:fs");
  const bytes = readFileSync("data/vua-tieng-viet/candidates-000.json");
  const doc = JSON.parse(bytes);
  validateDocument(doc, bytes.length);
  assert.deepEqual([...new Set(doc.entries.map((entry) => normalizeSpelling(entry.original).level))].sort(), [3, 5, 7, 9]);
  assert.throws(() => validateDocument({ ...doc, unexpected: true }, bytes.length));
  assert.throws(() => validateDocument({ ...doc, entries: [...doc.entries, doc.entries[0]] }, bytes.length));
  assert.throws(() => validateDocument(doc, 512 * 1024 + 1));
  assert.throws(() => validateDocument({ ...doc, preparedAt: "2026-02-30T00:00:00Z" }, bytes.length));
  assert.throws(() => validateDocument({ ...doc, entries: [{ ...doc.entries[0], definitionVi: "" }] }, bytes.length));
  const { canonicalJson } = await import("../../lib/vua-tieng-viet/dictionary-contract.ts");
  const { createHash } = await import("node:crypto");
  const recorded = readFileSync("data/vua-tieng-viet/candidates-000.canonical.sha256", "utf8").split(/\s+/)[0];
  assert.equal(createHash("sha256").update(canonicalJson(doc)).digest("hex"), recorded);
});

test("synthetic fixture is valid and independent of the extraction", async () => {
  const { validateDocument } = await import("../../lib/vua-tieng-viet/dictionary-contract.ts");
  const { readFileSync } = await import("node:fs");
  const bytes = readFileSync("tests/vua-tieng-viet/fixtures/synthetic.json");
  validateDocument(JSON.parse(bytes), bytes.length);
});

test("source candidates match exact retained record and sense", async () => {
  const { readFileSync } = await import("node:fs");
  const { gunzipSync } = await import("node:zlib");
  const { createHash } = await import("node:crypto");
  const doc = JSON.parse(readFileSync("data/vua-tieng-viet/candidates-000.json"));
  const digest = doc.sources[0].artifactSha256;
  const archive = readFileSync(`data/vua-tieng-viet/kaikki-${digest}.jsonl.gz`);
  assert.equal(createHash("sha256").update(archive).digest("hex"), digest);
  const lines = gunzipSync(archive).toString("utf8").split("\n");
  for (const entry of doc.entries) {
    const [, lineNumber, , senseIndex] = entry.externalId.split(":");
    const source = JSON.parse(lines[Number(lineNumber) - 1]);
    assert.equal(source.lang_code, "vi");
    assert.equal(entry.original, source.word);
    assert.equal(entry.definitionVi, source.senses[Number(senseIndex)].glosses[0]);
  }
});
