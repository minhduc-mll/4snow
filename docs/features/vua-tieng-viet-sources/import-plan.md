# Resumable candidate import plan

Types: a closed `import-start` input pins artifact ID, revision and expected chunk count; `import-apply` pins import ID, the validated v1 document and canonical hash; `import-finalize` pins import ID and expected decimal draft revision. Mutation envelopes include request and idempotency UUIDs. Receipts identify the import, index, hash and created/no-op counts; failures distinguish validation, revision, idempotency and import conflicts.

Pseudocode:

1. Authenticate through the existing Edge seam and enforce operation-specific limits. Stream-bound and strictly parse the envelope; revalidate the source document and recompute its canonical hash before privileged work.
2. In database transactions, lock the import and idempotency key. Start pins artifact metadata. Apply commits a validated chunk and immutable receipt atomically; same index/hash returns its receipt and a different hash conflicts. Keep staged material private.
3. Finalize under locks only after all indexes, artifact limits, source consistency and candidate identities are checked. Preserve prior revisions, link superseding records, create only pending/non-answer-eligible revisions, advance draft revision, and append the audit event and idempotency receipt in the same transaction.
4. Connect the admin upload workflow using typed hooks, Query-owned remote state, safe retries using the same mutation key, progress and bounded conflict feedback; clear private state on logout/401.
5. Test at the approved direct Edge/PostgREST and browser seams, including concurrency, lost responses, missing chunks, RLS and real authenticated-role denial. Run typecheck, focused and full tests, lint and build. Record that ticket 02 gateway verification and non-production credentials remain outstanding.

## Verification and outstanding environment checks

- `npm test`, `npm run test:deno`, `npx tsc --noEmit`, focused ESLint, and `npm run build` pass.
- `npm run test:browser` passes five journeys, including mocked resume, retry with the same idempotency key, and finalization.
- Disposable PostgreSQL 16 with Supabase-like roles: `tests/supabase/import.sql` passed missing chunks, same-key retries, hash conflicts, stale revisions, unchanged reimports, superseding pending entries, changed-content rollback, function grants, table RLS and apply-rate limits. Two concurrent synthetic apply calls returned the same receipt. These are not tests of real Supabase authenticated tokens or PostgREST.
- Repository-wide `npm run lint` still reports 15 existing errors and one warning under `.agents/skills`; focused ESLint passes.
- Ticket 02's gateway, real `anon`/authenticated access, real Supabase Edge/PostgREST integration, and cross-instance rate-limit tests remain unverified. Do not enable import until those checks pass in a non-production Supabase environment. The admin import controls require build-time `NEXT_PUBLIC_VTV_IMPORT_ENABLED=true` after verification; this flag is not an authorization mechanism.

Supersession is deliberately conservative: automatic links require trusted, independently recorded source-lineage attestations for both revisions that establish the stable identifier scheme and verify the exact source candidate content, plus matching `sourceEntryId` and `sourceSenseId` values prefixed `stable:`. Imports cannot create or modify those attestations; the later rights/lineage review must establish them. Only one unambiguous finalized lineage head may be linked. Positional identifiers such as `jsonl-line:` and `sense-index:` are not stable across extraction revisions and never create automatic links; those entries remain pending without a supersedes pointer until their lineage can be established.

Chunk receipts record newly staged and already-unchanged candidate counts at the time that chunk is applied. Finalization rechecks source identities and content under the draft lock and returns the definitive created/no-op totals; another finalized import can change the result between staging and finalization.
