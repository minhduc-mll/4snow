import { canonicalJson, normalizeSpelling } from "../../lib/vua-tieng-viet/dictionary-contract.ts";
import { previewImport } from "../../lib/vua-tieng-viet/preview.ts";

declare const Deno: { test(name: string, fn: () => void | Promise<void>): void; readTextFile(path: string): Promise<string> };

Deno.test("shared normalizer and canonical hashing in Deno", async () => {
  if (normalizeSpelling("tiếng Việt").normalized !== "TIẾNGVIỆT") throw new Error("NFC mismatch");
  if (normalizeSpelling("ê").normalized === normalizeSpelling("e").normalized) throw new Error("Accent lost");
  if (normalizeSpelling("ê").normalized === normalizeSpelling("ế").normalized) throw new Error("Tone lost");
  if (normalizeSpelling("đ").normalized === normalizeSpelling("d").normalized) throw new Error("Stroke lost");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson({ b: 2, a: 1 })));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (hex !== "43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777") throw new Error("Canonical hash mismatch");
  const fixture = await Deno.readTextFile("tests/vua-tieng-viet/fixtures/synthetic.json");
  if (!(await previewImport(fixture)).valid) throw new Error("Fixture rejected");
});
