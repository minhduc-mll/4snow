# Source investigation — not release-ready

This is an unresolved source ledger, not a rights clearance. The generated candidates are pending editorial review and are not eligible for publication. Publication remains blocked until a qualified reviewer records clearance and applicable obligations.

## Kaikki / Vietnamese Wiktionary

- Observed source listing: https://kaikki.org/viwiktionary/rawdata.html (accessed 2026-11-08). It reports extraction on 2026-11-03, originating from the viwiktionary dump dated 2026-10-02, and identifies revisions `19f9a30` and `6f96ddf`. This listing changes and must be archived alongside the bytes and independently matched to them before treating these observations as a pinned revision.
- Downloaded URL: https://kaikki.org/viwiktionary/raw-wiktextract-data.jsonl.gz (mutable; **not an immutable artifact reference**).
- Download completed 2026-11-08T09:25:37Z; compressed-byte size 34,422,366; SHA-256 `1f0abd21982660b5fc2eff5eb3fbacbed2d9fe8f476af794dbed0d927ffb8187`. This is the hash of the gzip bytes, not decompressed JSONL or canonical JSON. The byte-identical extraction is retained under that digest in `data/vua-tieng-viet/`; the digest is its immutable content reference. The upstream URL remains mutable.
- The chunk identifies each entry by one-based JSONL line and zero-based sense index within that exact compressed artifact. Each selected sense retains its original Vietnamese gloss and entry-history link. Importing does not approve an entry; all records are pending editorial review and are not answer eligible.
- Full referenced tool commits: [wiktextract 19f9a3006a405fb7bfb40193dca41c7117a009a5](https://github.com/tatuylonen/wiktextract/commit/19f9a3006a405fb7bfb40193dca41c7117a009a5) and [wikitextprocessor 6f96ddf5f3466707f1869fe6618390fd77dfd109](https://github.com/tatuylonen/wikitextprocessor/commit/6f96ddf5f3466707f1869fe6618390fd77dfd109). The listing and bytes were observed separately; source metadata is a claim to be confirmed by the reviewer, not a cryptographic attestation from upstream.

## Rights evidence and unresolved review

[Kaikki's Vietnamese edition](https://kaikki.org/viwiktionary/) describes its extracted data as available under Wiktionary's CC BY-SA and GFDL terms. [Vietnamese Wiktionary's copyright policy](https://vi.wiktionary.org/wiki/Wiktionary:Quy%E1%BB%81n_t%C3%A1c_gi%E1%BA%A3) identifies CC BY-SA 4.0 for most text, with some imported text not available under GFDL. The applicable terms must be checked per material; do not assume the GFDL applies to every entry.

Potential obligations for review include attribution to contributors with accessible source and history, identifying the license and changes, and providing modified material under applicable share-alike terms. Relevant texts: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/legalcode) and [GFDL 1.3](https://www.gnu.org/licenses/fdl-1.3.html). The precise attribution, history access, modification notice and redistribution method for the selected records are **unresolved**, as are applicable GFDL versions and entry-specific exceptions. No reviewer, review date, or clearance has been recorded. The links above are evidence for investigation, not a legal determination.

## Underthesea

Omitted: no specific Underthesea-related lexical dataset, immutable revision, provenance and independent dataset rights have been verified. The [toolkit repository](https://github.com/undertheseanlp/underthesea) or tokenization results alone do not establish those facts. This omission does not block a separately cleared Kaikki-only release.

## Remaining work

Obtain qualified rights review and editorial decisions before publication. Regenerate with `node scripts/vua-tieng-viet/prepare.mts`; verify with `node --test tests/vua-tieng-viet/contract.test.mjs` (Node 24). The selected records are a small review seed, not sufficient reviewed coverage for a release. Synthetic fixtures are separate under `tests/vua-tieng-viet/fixtures/` and must never be published.

## Verification

- `npx.cmd tsc --noEmit`: passed.
- `npm.cmd run build`: passed with network access; the sandboxed attempt failed fetching the existing Google fonts.
- `npm.cmd run lint`: failed on 15 existing `no-require-imports` errors and one warning under `.agents/skills`; none are in these documents.
- `node --test tests/vua-tieng-viet/contract.test.mjs`: six tests passed, covering accent-sensitive normalization, invalid characters, canonical-hash golden value, schema and bounds, synthetic data, and exact retained source records. There is no repository test script in `package.json`.
- The offline validator checks decoded values and is not a substitute for the future trusted import validator, which must also reject duplicate JSON keys before parsing and repeat all checks.
- The fixtures have only been run in Node; browser and Edge cross-runtime parity remains unverified and must be established when those runtimes are implemented.
