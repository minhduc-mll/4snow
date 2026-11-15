import { expect, test } from "vitest";
import { normalizeSpelling } from "../../lib/vua-tieng-viet/dictionary-contract";
import { parseStrictJson } from "../../lib/vua-tieng-viet/strict-json";

test("Vietnamese spellings preserve accents across canonical forms", () => {
  expect(normalizeSpelling("tiếng Việt")).toEqual({ normalized: "TIẾNGVIỆT", level: 9 });
  expect(normalizeSpelling("ê").normalized).not.toBe(normalizeSpelling("e").normalized);
  expect(normalizeSpelling("ê").normalized).not.toBe(normalizeSpelling("ế").normalized);
  expect(normalizeSpelling("đ").normalized).not.toBe(normalizeSpelling("d").normalized);
  expect(() => normalizeSpelling("K" )).toThrow();
});

test("JSON duplicate keys cannot be disguised with escapes", () => {
  expect(() => parseStrictJson('{"a":1,"\\u0061":2}')).toThrow();
});
