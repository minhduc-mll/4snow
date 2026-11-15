# Ticket 07 narrow implementation plan

Prerequisites: tickets 04/06 locally verified; ticket 05 locally verified under the developer's explicit scope (see `ticket-05-verification.md`). Preserve unrelated working-tree changes. Initial review point: `41c5f4251be72f899b77f8579ab794a12d65e6a2`.

Types: `PublicationPreviewInput { expectedDraftRevision: string }`; `PublishInput { buildId: UUID; expectedDraftRevision: string; expectedCurrentReleaseId: UUID | null }`. Both use mutation envelopes with request/idempotency UUIDs. Public `ReleasePayload` has exactly schemaVersion, normalizerVersion, releaseId, configurationId, attemptLimit, levels 3/5/7/9, attributions. Preview returns a bounded report, coverage, pinned build/hash/configuration/current pointer and bounded exact player samples, never the corpus.

Pseudocode:
1. Authenticate the existing custom admin JWT; validate exact fields and ordinary 64 KiB body. Apply shared 30-preview/5-publication-attempt database limits. Keep safe error responses bounded.
2. Under the draft lock, build a consistent snapshot from finalized current approved revisions. Validate exclusions, spelling/level, meaning eligibility, latest explicit cleared rights, attribution/provenance and selected collisions. Deduplicate guesses independently. Construct only allowlisted public fields and deterministic sorted arrays. Validate all four levels, limits and serialized bytes; store immutable successful/failed private builds plus pinned source/revision/rights/configuration references. Canonical SHA-256 is shared with public browser validation.
3. Publish under idempotency, draft and pointer locks. Compare expected draft and expected current release (including null bootstrap), validate stored build/hash/report/caps again, insert the full immutable public row, CAS the singleton pointer and append audit/receipt in the same transaction. Advance the draft on successful publication so simultaneous requests cannot both publish from the same preview. Matching retries return the original result before stale checks. Rollbacks expose neither release nor pointer.
4. Public RLS/SELECT only for complete releases/pointer. Revoke browser writes, private tables and RPCs. Retain old releases; enforce immutability even for accidental privileged updates.
5. Extend the existing admin shell with explicit refresh-preview, coverage/errors/player samples, publish and identical retry controls. TanStack Query owns private remote data; invalidate affected queries, clear/cancel on logout/401. Do not add configuration editing (ticket 12).

Approved test seams: pure normalization/public validation; authenticated Edge boundary; disposable SQL transactions/concurrency/RLS; browser admin behavior. Use TDD slices, focused tests/typechecks during work, full suite/lint/build at end, separate Standards/Spec review agents, then commit task changes.

## Verification (2026-11-14)

- `npm test`: 34 Node tests and 2 Vitest tests passed. Focused publication tests passed after shared hash extraction and retry fixes.
- `npx tsc --noEmit`, `npm run lint`, `npm run build`: passed. Build used network access for the existing Google font configuration.
- `npm run test:browser`: all 8 browser journeys passed. Focused publication journey passed again after adding malformed-success-response recovery. Covers validation errors, coverage/player previews, stale conflict and refreshed preview, committed-response loss plus malformed receipt followed by the identical-key retry, one committed result and 401 cleanup. Publication HTTP responses are mocked in these browser tests.
- `node tests/vua-tieng-viet/publication-sql.integration.mjs`: passed with all migrations in a disposable local PostgreSQL database; removed afterward. Covers complete/empty coverage, definitions/membership, rights, selected/unresolved/edited collisions, guess/byte limits, retained releases, immutability, private grants/public reads, five-attempt limiter, stale draft and pointer CAS, receipts/audit, forced transaction rollback, actual simultaneous competing publishers and JS/SQL canonical hash parity. Repeated after URL validation review fixes.
- Ticket 05's separate real local browser/role-denial and SQL results are in `ticket-05-verification.md`. The broader pre-existing HTTP harness still stops on its preflight 204-versus-200 expectation; no gateway configuration was changed.

## Standards review

Initial review found unguarded draft request-ID generation and a correctness concern about losing idempotency after malformed success responses. Wrapped request construction and classified response-parser failures as uncertain/unavailable, retaining the original request. Added browser recovery coverage. Shared publication/editorial request hashing now uses one helper. Reviewer confirmed 0 remaining hard violations or correctness findings. One optional transport-duplication judgement remains; the transport stays feature-local to avoid refactoring existing editorial hooks.

## Spec review

Initial review found malformed source authorities passing SQL HTTPS validation. Added conservative DNS-label/port validation and malformed-host, credentials, invalid-port and invalid-IDNA regression cases. This publication policy rejects IP literals and unvalidated `xn--` labels, rather than guessing URL validity. SQL suite passed; reviewer confirmed 0 remaining findings.

Totals: Standards 0 remaining hard/correctness findings, 1 optional duplication judgement; Spec 0 remaining findings. Reviewed the staged task-only diff against the initial commit before committing, then verified the working-tree fixes.

## Local milestone and release limits

Implementation is locally verified under the explicitly accepted prerequisite scope. New migrations are tested but not applied to the application's local or hosted database. New publication operations were exercised through the handler and real PostgreSQL boundary, not deployed Edge HTTP. Hosted gateway/RLS, real HTTP publication concurrency and production source rights/lineage acceptance remain release requirements. No real dictionary or synthetic application release was published. Public loader/gameplay belongs to later tickets; this ticket does not start new rounds or configure attempts.
