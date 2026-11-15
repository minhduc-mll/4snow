# Ticket 06: answer collision selection

Scope: local development after ticket 04's local verification. Preserve existing uncommitted verification work; production rights and hosted acceptance remain release requirements.

Types: `SelectAnswerInput = { normalized: string; level: 3 | 5 | 7 | 9; entryRevisionId: string; expectedDraftRevision: string }`. Collision inspection is a bounded, cursor-paginated private read with the same normalized spelling and level. It returns current revisions, provenance, eligibility, selected revision and resolution status.

Pseudocode:
1. Authenticate and validate exact request fields, canonical spelling/level, UUID and draft revision. Apply shared private-read/editorial-mutation limits.
2. Under idempotency and draft locks, verify selected revision belongs to its entry, is current, approved, answer eligible, common, and has a reviewed definition/exclusion checks in a finalized import. Upsert one private selection per normalized spelling, advance draft and append the audited input/output/configuration and receipt.
3. Derive private projection: distinct approved guess membership independently; one eligible answer is automatic only without a prior invalidated selection; multiple eligible answers require a valid exact selection. A stale selection is unresolved, with no fallback. Rights clearance remains an additional publication gate in ticket 07.
4. Inspect alternatives through paginated collision reads from candidate detail; display original/definition/revision/provenance and explicit select buttons. Use existing TanStack Query cache, invalidation and auth cleanup; retry the identical mutation after response loss.

Verification seams already approved in the specification: pure request validation, trusted Edge/SQL interfaces, browser admin journeys. Use red/green slices, regular strict typechecking, then full tests, lint and build. Review this task's diff against the initial HEAD with separate Standards and Spec agents as required by the code-review skill. Commit only this task's files.

## Verification (2026-11-14)

- `npm test`: 32 Node tests and 2 Vitest tests passed. Focused editorial/collision/rights tests passed again after extracting the shared editorial request hash.
- `npx tsc --noEmit` and `npm run lint`: passed, including after review changes.
- `npm run test:browser`: all 7 browser journeys passed. The new journey covers private alternatives/provenance, disabled ineligible selection, stale conflict/refetch, committed-response loss with identical-key retry, selected meaning and logout cleanup. These browser tests mock the external HTTP boundary; they do not establish deployed Edge behavior.
- `node tests/vua-tieng-viet/collision-sql.integration.mjs`: passed with all migrations applied to a fresh disposable local Docker database, removed afterward. Covers zero/one/multiple eligible answers, bounded keyset pagination, private grants, exact selected definition, independently deduplicated guesses, stable retry/audit, stale draft, changed-key payload, same-spelling ineligibility, spelling mismatch and edit-invalidated selections. It does not alter the application's local database.
- `npm run build`: passed with network access for existing Google font downloads. The initial sandboxed build failed to fetch those fonts; no code change was needed.

## Standards review

No hard documented-standard violations or security defects found. One judgement finding: duplicated mutation retry state machine and request hashing. Extracted shared editorial request hashing. Kept the small selection retry state machine consistent with the existing hook rather than refactoring all editorial mutations in this ticket; its retry behavior is browser-tested.

## Spec review

One coverage finding: same-spelling ineligible selection and zero/one eligible collisions needed explicit cases. Added them and reran the disposable SQL suite successfully. No scope creep or demonstrated implementation defect found.

Review totals: Standards 0 hard violations, 1 duplication judgement (partially reduced, remaining hook consistency documented); Spec 1 coverage finding, resolved. Reviews used the staged task-only diff against initial HEAD `1777b289ea04591416e39a0262672b5fc5f4e7a5` before committing, preserving unrelated unstaged work.

Limitations: the migration is tested but not applied to the application/hosted database; no hosted gateway, new-operation real HTTP concurrency or production rights clearance was verified. Ticket 07 must consume the private editorial projection within its consistent snapshot and enforce all rights/provenance/release gates; it is not itself a public release payload.
