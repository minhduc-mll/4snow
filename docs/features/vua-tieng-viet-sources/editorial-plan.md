# Candidate editorial review plan

Types: a closed union of list, detail, list-history and review requests; bounded filter/cursor inputs; candidate summaries, immutable revisions and editorial decisions; a review includes entry/draft revisions, spelling, definition, status, answer eligibility, category, rationale and explicit exclusion checks.

Pseudocode:
1. Strictly validate all requests at the existing authenticated Edge boundary. Bind cursors to canonical filter fingerprints, enforce page and body bounds, rate-limit reads and mutations, and hash mutation inputs for transactional idempotency.
2. Query only finalized imports with indexed keyset pagination. Return explicit, bounded provenance and revision projections, never entire private tables or secrets.
3. Under draft and entry locks, reject stale revisions; normalize spelling and validate policy. Editing spelling or definition always creates a new pending, ineligible revision. Approvals require all explicit exclusion checks; answer eligibility additionally requires a reviewed definition, common category and rationale. Append revision and audit event, move the entry pointer and advance the draft atomically; retries return the original receipt.
4. Add accessible localized filtering, bounded pagination, details/history and review controls to the existing authenticated admin shell. Query owns remote data, invalidates after successful review and is cleared on logout/401.
5. Test pure validation, direct Edge authorization and database transactions at the specification's agreed seams, plus browser journeys. Run typecheck, focused/full tests, lint and build; record environment gaps and never infer human editorial judgment.

## Verification and limitations

- 2026-11-14 local verification supersedes the local environment/lint gaps below: the real browser editorial workflow, lost-response recovery, competing different-key edits, authorization/cursor checks, disposable editorial SQL suite and bounded exact read/mutation rate limits passed. All three local-browser journeys, Node/Vitest/Deno, strict typecheck, lint and build passed. An unrestricted 152-request burst produced 503s and remains a local capacity limitation. See `ticket-04-verification.md` for commands and evidence. Hosted acceptance and real-source human review remain pending; no ticket 06 work was started.

- `npm test`, `npm run test:deno`, `npx tsc --noEmit`, Deno Edge typecheck, focused ESLint, and `npm run build` pass.
- Playwright's complete admin suite passes, including a mocked filter and answer-review journey. Trusted tests cover invalid review policy, cursor tampering/filter binding, unauthorized calls and stale/idempotent requests.
- Disposable PostgreSQL 16 with Supabase-like roles: `tests/supabase/editorial.sql` passed finalized-only visibility, keyset paging, definition/collision filters, approval, edit reset, rejection, stale revisions, history, retry and denied role grants. This is not a deployed Supabase gateway or real authenticated-role integration test.
- Repository-wide lint still reports 15 existing errors and one warning in unrelated `.agents/skills` scripts; focused ESLint passes.
- Non-production Supabase gateway, real authenticated-role/RLS and concurrent deployed checks remain unverified. Review controls use the existing `NEXT_PUBLIC_VTV_IMPORT_ENABLED` gate and should remain disabled until those checks pass. Human review and rights clearance remain necessary before real-data publication.
