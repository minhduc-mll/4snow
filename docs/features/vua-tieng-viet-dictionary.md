# Vua tiếng Việt Dictionary and Administration Requirements

Status: Product decisions confirmed. This document specifies future implementation; the current work is documentation only.

Implementation handoff: [implementation-ready specification](./vua-tieng-viet-spec.md), including versioned imports, database/RLS design, trusted operation contracts, and publication tests.

Read [gameplay requirements](./vua-tieng-viet.md) for normalization and game behavior. This document owns source provenance, editorial data, publication, and trusted admin operations.

## 1. Sources and responsibilities

Use Kaikki/Wiktionary for Vietnamese words and definitions. Prefer Vietnamese-language entries extracted from Vietnamese Wiktionary so answer definitions meet the Vietnamese-language requirement. Pin the selected extraction and record its originating dump/version.

Use Underthesea-related lexical resources to expand candidate guesses. Underthesea tokenization output alone is not proof that an expression is a valid dictionary entry. Identify the specific resource, revision, provenance, and usage rights before importing it. Underthesea candidates require explicit editorial approval and cannot automatically become answers.

Every imported candidate requires review before publication. Accepted guesses require verified spelling and eligibility; answer entries additionally require a reviewed Vietnamese definition linked to the chosen meaning. Administrators can review and edit both. Preserve provenance when editing.

Prepare source data offline and export versioned JSON for upload through `/admin`. Underthesea tooling, when needed, runs only during offline preparation. Add no deployed Python or Node server, runtime source scraping, or source-fetch requirement to the application.

The JSON format must identify its schema version, source artifact revisions, provenance/rights records, and candidate entries. Browser previews report validation errors; trusted import validation remains authoritative. Uploading an artifact creates private candidates, never automatically published content. Specify the exact typed format and size/batch limits before implementing the importer.

## 2. Provenance and licensing

Retain source name, source URL, source entry/sense identifiers when available, extraction/resource revision, import timestamp, applicable license information, and modification history. Keep attribution linked to definitions through publication and player display.

Kaikki states its Vietnamese Wiktionary extraction follows Wiktionary licensing, including CC-BY-SA and GFDL. Source selection must verify the applicable terms and define attribution/share-alike handling for the selected material before publication. A private database does not remove obligations for content delivered to players.

Verify the selected Underthesea lexical resource's own license; do not assume the toolkit's software license establishes rights for every associated dataset.

Source references checked during planning:

- [Kaikki Vietnamese Wiktionary edition and licensing](https://kaikki.org/viwiktionary/index.html)
- [Underthesea documentation](https://github.com/undertheseanlp/underthesea/blob/main/README.md)

Record exact source artifacts during implementation rather than relying on mutable website counts or the latest default branch.

## 3. Editorial lifecycle

```text
Source artifact -> validated import -> private candidates
-> admin review/edit -> approved guesses and eligible answers
-> validate complete release -> publish gameplay dataset
```

Admin capabilities:

- Preview imports and validation errors before applying changes.
- Filter by source, normalized length, review status, definition availability, and normalized collisions.
- Edit spelling and Vietnamese definitions while retaining previous revisions and provenance.
- Approve or reject candidates and separately control answer eligibility.
- Preview the exact player-facing answer, definition, and attribution.
- Inspect coverage for all four levels before publication.
- Publish approved content and configure the attempt limit.

Use immutable revisions and append-only editorial events where practical. Every mutation records timestamps, input, outcome, and relevant configuration/revision. Never include passwords, JWTs, or secrets in audit records. The shared admin JWT identifies a role, not an individual editor; do not claim per-person attribution.

Validate on the trusted side even when browser previews already validate. Inputs are untrusted, including imported files and text rendered as definitions. Render source content safely as text or with an explicitly safe formatting policy.

### Editorial eligibility

- Answers: common Vietnamese words and meaningful phrases, with a reviewed Vietnamese definition for the selected meaning.
- Accepted guesses: approved answers plus reviewed regional, technical, and less-common Vietnamese words or meaningful expressions.
- Exclude proper names, abbreviations, offensive terms, malformed entries, and unverified generated text from both sets in the initial scope.
- Slang receives no automatic eligibility; reviewers must establish that it meets the applicable policy above. Reject it when eligibility cannot be established.

Source membership alone does not establish commonness, appropriateness, or answer eligibility. Admins apply the policy explicitly and record review outcomes. Apply the same policy when changing an existing entry.

## 4. Normalization and data integrity

Use the normalization contract in the gameplay document for imports, review, publication, and submissions. Recompute normalized spellings and supported lengths from edited originals.

Keep differently accented spellings distinct in membership and answer selection; E, Ê, and Ế differ, as do D and Đ. Canonical Unicode equivalents, case variants, spacing variants, or multiple senses of the same exact spelling can still normalize identically. Publish one guess membership value per accent-preserving normalized spelling. Publish at most one selected answer entry per normalized spelling in a release, with its specific definition; keep alternate source records privately for review.

An allowed guess need not be an answer. Only 3/5/7/9-letter normalized forms are playable. Reject malformed entries, unsupported characters, missing provenance/rights information, and answer candidates without meaningful Vietnamese definitions.

Reimporting a source must not silently overwrite reviewed changes. Report duplicates and conflicts for resolution; make retrying an import safe against duplicate records.

## 5. Supabase data boundaries

Keep candidate entries, editorial revisions, imports, audit events, and draft configuration private. RLS is required; browser anon/authenticated roles receive no direct private read or mutation privileges.

Expose only published gameplay fields: release/version identifiers, normalized guess membership, selected answer entries, reviewed definitions, attribution, and public configuration. Do not expose rejected candidates, review notes, import payloads, or secret credentials. Restrict public reads to published data and deny direct public writes.

Feature-owned storage responsibilities, with final schemas to be specified before implementation:

| Responsibility | Required content |
| --- | --- |
| Sources/imports | Provenance, rights metadata, artifact version, validation outcome, timestamps |
| Entry revisions | Original spelling, normalized form, sense/definition, review and eligibility decisions |
| Editorial events | Operation, previous/next revision references, inputs, outcomes, timestamps |
| Releases | Approved content snapshot, public attribution, configuration version, publication status |

TanStack Query owns remote admin and published data caches. Invalidate affected queries after successful mutations. Keep only UI filters, selection, dialogs, and unsaved interactions in local UI state.

## 6. Trusted admin authorization

Retain `/api/admin/login` and `/api/admin/verify` for their existing authentication purposes. Add no gameplay, dictionary, import, or publication Next.js Route Handlers or Server Actions.

Private reads and dictionary/configuration mutations use Supabase Edge Functions. Each function independently verifies the existing application JWT signature, permitted algorithm, `role: admin`, and valid timestamp claims before using privileged database access. Verification must reject malformed/expired tokens and must not rely on the browser's authenticated UI state.

The existing custom JWT is not a Supabase Auth session. Define and verify function gateway/header behavior for this token before deployment; do not assume default Supabase JWT verification accepts it. If platform JWT verification is disabled for a custom-token function, application verification remains mandatory before every private operation.

Configure the matching admin verification secret in trusted Edge Function environment configuration. Keep it and privileged database credentials server-side. Do not expose credentials through public environment variables, client bundles, responses, or logs. Browser requests continue to use only browser-safe Supabase keys.

Typed contracts must be specified before implementation for private listing, import/preview, revision editing/review, configuration updates, and publication. Include runtime input validation, payload limits, bounded pagination, safe error codes, authorization errors, conflict handling, and retry/idempotency behavior. Protect trusted operations with appropriate rate limits.

This extends existing admin-token use to dictionary operations while keeping credential login/issuance in its current endpoints. The matching scope clarification is recorded in `admin-auth.md`.

## 7. Publication and concurrency

Build a complete validated release before changing what players can read. Publication must expose a consistent combination of guesses, eligible answers, definitions, attribution, and configuration; partial imports must never become playable.

Require coverage for all four levels, unique normalized answers, valid guess membership, reviewed definitions, and source/rights completeness. A failed publication leaves the previous published release usable. Only explicitly approved content enters a release.

Use revision checks to reject stale admin edits and prevent silent overwrites. Deduplicate retried trusted operations.

Published release content is immutable. Publish corrections as a new release and atomically change the current-release pointer only after validation succeeds. New rounds use the current release; active and restored rounds use their saved release/configuration snapshots as specified in the gameplay document.

Retain release provenance and publication audit history. The initial admin scope does not require historical rollback or release deletion controls; publishing a corrected release is the recovery path. Server-side retention tuning must preserve audit/provenance requirements and does not substitute for validating local saves.

## 8. Acceptance criteria

- Unauthenticated and invalid-token requests cannot read private data or change configuration/content, even by direct HTTP calls.
- Public database requests cannot mutate data or read drafts, candidates, or editorial records.
- Admin review is required for all sources; Underthesea candidates cannot bypass it.
- Admin edits preserve original source references and revision history.
- Collisions retain their distinct meanings privately and publish deterministic answer selection.
- Import retries do not duplicate records or overwrite reviewed changes silently.
- Missing definitions, unsupported lengths, empty levels, unresolved rights, and malformed content block publication.
- Failed or concurrent publication cannot expose a partial release.
- Published answers display the matching reviewed definition and required attribution.
- No private secrets or source-review metadata reach the browser.
- Versioned JSON imports remain private until reviewed and explicitly published.
- Editorial exclusions apply to guesses as well as answers; answer commonness and definition requirements are enforced separately.
- Publishing a new release leaves active rounds unchanged; new rounds select the newly current release.

## 9. Implementation handoff

Product decisions for this scope are settled. Implementation planning must specify concrete SQL schemas/RLS policies, the versioned JSON import schema, request/response contracts, bounded import operations, revision/idempotency handling, and authorization tests before feature code is written.

Acquiring source artifacts, selecting the specific Underthesea lexical resource, and verifying their provenance and redistribution terms are implementation prerequisites. Source names alone do not establish a verified initial dataset. No source ingestion, license clearance, database deployment, or Edge Function deployment has been performed by this documentation work.
