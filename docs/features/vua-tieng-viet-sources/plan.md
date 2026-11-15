# Source preparation plan

1. Capture the upstream extraction metadata and retrieve the exact source bytes; hash those bytes and preserve an immutable copy/reference before selecting records.
2. Model the import document as schema version 1 with typed Source, Rights and Candidate records from the implementation specification. Select Vietnamese entries and individual Vietnamese senses, retaining stable source locations and unresolved rights.
3. Normalize each original using `vi-nfc-v2`: validate supported characters, NFC-normalize, remove U+0020 spaces, uppercase, then count letters; select candidates for lengths 3, 5, 7 and 9. Split into bounded chunks and validate strict schema, references, sizes and canonical hashes against independent golden fixtures.
4. Keep synthetic test data separate. Record rights evidence and unresolved review decisions; no candidate is approved by import. Verify behavior, typecheck, lint and build.

Do not infer missing extraction identity, legal clearance, or Vietnamese definitions. If source bytes and metadata cannot be independently pinned, document the blocker and do not label a constructed artifact as attributable.

## Implementation contract (2026-11-08)

Types: `Rights`, `Source`, `Candidate`, and `ImportDocument` follow the version 1 wire table; a validation result contains normalized spellings and levels or errors. Source identities use the compressed artifact digest plus one-based JSONL line and zero-based sense index. The full gzip is retained by content hash; source metadata is a claim pending rights review.

Pseudocode: read and verify gzip SHA-256; for each JSONL record with language `vi`, inspect each Vietnamese gloss; validate the original with the shared accent-sensitive normalizer; select source entries for each level; emit strict import JSON and a separate synthetic fixture; validate fields, references, limits and canonical hash against fixed fixtures before writing. The importer, not these JSON documents, assigns pending review status. Rights claims never grant clearance.
