# Source rights review implementation plan

- Types: `RightsDecision = cleared | unresolved | rejected`; mutation input holds source ID, expected draft revision, decision, evidence and obligations. A candidate detail includes the latest private review and an explicitly constructed public attribution preview.
- Validate the exact mutation envelope and bounded, nonblank evidence/obligations. Authorize and rate-limit through the existing Edge endpoint; hash the validated payload without request ID.
- In one database transaction, serialize idempotency keys, return matching retries, lock the draft, reject stale revisions, find a finalized source, append a linked review, advance the draft, and record admin audit/configuration and receipt. No imported claim grants clearance.
- Extend candidate detail with latest decision and allowlisted attribution only. Render text as text and links only after HTTPS URL validation. Invalidate private editorial queries on success or conflict; retain identical retry payload on uncertain failures.
- Verify contract, authorization, idempotency, privacy, database revision behavior, typecheck, lint and build. Synthetic fixtures cannot establish production rights.

## Verification

- Node/Vitest: 30 and 2 tests passed; Deno: 2 tests passed; strict TypeScript and Deno Edge check passed.
- Six Playwright journeys passed with mocked Edge responses, including the rights form and private evidence exclusion from the displayed attribution preview.
- PostgreSQL 16 disposable database with simulated Supabase roles: all migrations and `tests/supabase/rights-review.sql` passed, covering private access, unresolved/cleared/rejected decisions, linked revisions, retries, conflicts and exact attribution allowlist.
- Focused lint and production build passed. Repository-wide lint still fails on 15 pre-existing errors and one warning in unrelated `.agents/skills` scripts.
- Non-production Supabase gateway behavior and real authenticated-role/RLS checks remain unverified. Controls remain behind the existing deployment gate. No production source is cleared by synthetic tests; verified evidence and an appropriate reviewer remain required.
