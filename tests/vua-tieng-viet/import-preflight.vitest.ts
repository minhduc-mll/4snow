import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { preflightImport } from "../../lib/vua-tieng-viet/import-preflight";
import type { ImportDocument } from "../../lib/vua-tieng-viet/dictionary-contract";

const fixture: ImportDocument = JSON.parse(readFileSync("tests/vua-tieng-viet/fixtures/synthetic.json", "utf8"));
const file = (name: string, document: unknown) => new File([JSON.stringify(document)], name);
const dataset = { ...fixture, chunkIndex: undefined, chunkCount: undefined };

test("preflights 10,000 candidates into bounded deterministic chunks", async () => {
  const entries = Array.from({ length: 10000 }, (_, index) => ({ ...fixture.entries[0], externalId: `candidate-${index}` }));
  const input = file("dataset.json", { ...dataset, entries });
  const result = await preflightImport([input]);
  expect(result.validCount).toBe(10000);
  expect(result.issues.filter((issue) => issue.blocking)).toEqual([]);
  expect(result.chunks).toHaveLength(50);
  expect(result.chunks.map((chunk) => chunk.canonicalHash)).toEqual((await preflightImport([input])).chunks.map((chunk) => chunk.canonicalHash));
});

test("splits by serialized UTF-8 size even when the entry limit is unused", async () => {
  const entries = Array.from({ length: 100 }, (_, index) => ({ ...fixture.entries[0], externalId: `candidate-${index}`, definitionVi: "ệ".repeat(2000), sourceNotes: "ư".repeat(1000) }));
  const result = await preflightImport([file("wide.json", { ...dataset, entries })]);
  expect(result.validCount).toBe(100);
  expect(result.chunks).toHaveLength(2);
  for (const { document } of result.chunks) expect(new TextEncoder().encode(JSON.stringify(document)).length).toBeLessThanOrEqual(512 * 1024);
});

test("indexes selected parts and reports blockers across file boundaries", async () => {
  const first = file("one.json", { ...fixture, chunkCount: 2 });
  const second = file("two.json", { ...fixture, chunkIndex: 1, chunkCount: 2, entries: [
    fixture.entries[0],
    { ...fixture.entries[0], externalId: "bad-length", original: "mèo ta" + "m" },
    { ...fixture.entries[0], externalId: "bad-source", sourceId: "missing" },
  ] });
  const result = await preflightImport([first, second]);
  expect(result.chunks).toEqual([]);
  expect(result.issues.filter((issue) => issue.blocking).map(({ file, part, entry, code }) => ({ file, part, entry, code }))).toEqual([
    { file: "two.json", part: 2, entry: 1, code: "identity" },
    { file: "two.json", part: 2, entry: 2, code: "length" },
    { file: "two.json", part: 2, entry: 3, code: "source" },
  ]);
  expect((await preflightImport([first])).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "metadata", blocking: true })]));
});
