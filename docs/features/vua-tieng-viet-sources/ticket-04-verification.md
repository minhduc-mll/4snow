# Ticket 04 local verification

## Plan and types (2026-11-14)

Ticket 03 is locally verified under the accepted local-development scope. Verify editorial workflows against the actual local browser, Edge Function, PostgREST and database; hosted checks remain release requirements. Do not implement ticket 06 or clear real-source rights.

Use a unique synthetic `ImportDocument` with 51 entries to exercise bounded UI pagination, accented spelling collisions and missing definitions. Use the existing `ReviewInput` and `Filters` contracts and narrow network responses from `unknown`. Authenticate using the temporary local admin server; seed only through the trusted import operations. Retain no tokens, keys or network traces.

Pseudocode:

1. Import/finalize synthetic candidates, identify their persisted source, and use real UI source/level/review/definition/collision filters. Verify first/next/first paging and escaped imported text.
2. Reject an invalid answer policy in the UI. Approve a synthetic candidate with explicit checks; discard the committed HTTP response and retry with the same key/receipt. Verify query invalidation and immutable history.
3. Edit spelling/definition and assert a new pending, answer-ineligible revision with recomputed normalization and preserved history/provenance.
4. Open the same current revision in two authenticated contexts. Release two distinct-key mutations concurrently, expect one success and one safe 409, and verify the losing UI reloads current data rather than overwriting.
5. Verify logout and a real unauthorized token clear private UI. Run the editorial SQL suite in a fresh disposable database, existing HTTP security/cursor checks, relevant tests, strict typecheck, lint and build. Record any defects and remaining limits explicitly.

## Fresh local results

| Check | Result |
| --- | --- |
| Real editorial browser journey | Passed |
| Existing local import recovery and preview browser journeys | Passed; all three browser tests exited cleanly in 12.4 seconds |
| Fresh disposable-database editorial SQL suite | Passed with all four migrations; test database removed |
| Real local gateway security/integration suite | Passed; actual anon and Auth-issued authenticated user denied all 13 dictionary RPCs and 15 private tables |
| Exact bounded-concurrency gateway rate limits | Passed: 120 reads succeeded/1 limited; 30 stale mutations conflicted/1 limited; both limited requests carried positive Retry-After |
| Node/Vitest | Passed: 30 Node and 2 Vitest tests |
| Deno | Passed: 2 tests |
| Strict TypeScript | Passed |
| Repository lint | Passed |
| Production build | Passed |

### Browser evidence

[editorial.spec.ts](../../../tests/local-browser/editorial.spec.ts) imports and finalizes 51 unique synthetic candidates through the real trusted API. The actual UI demonstrates:

- Source, three-letter level, pending-review, definition-present/absent and collision filters. The accented `mèo` group remains distinct from `meo`; the first page contains 50 entries and the next contains one.
- Imported HTML-like source notes remain visible text and do not execute.
- Answer approval without a definition is rejected in the browser; approval with explicit exclusion checks, common category, definition and rationale succeeds.
- The test commits an actual review with `route.fetch`, discards only its response, and then retries through the real backend. The key and receipt match the original operation; no synthetic successful HTTP response is substituted.
- Spelling/meaning edits create revision 3 as pending/ineligible, recompute `mêu` to `MÊU`, and preserve original and approved revisions in visible history.
- Two independently authenticated browser contexts submit different-key approval/rejection operations from the same current revision. A barrier releases both real HTTP calls together. Exactly one returns 200 and one returns 409; the current revision advances once to 4, provenance remains intact, and both contexts display revision 4 after query invalidation/refetch.
- A real invalid custom token receives 401 and removes the private editor. Logout clears the editor in the other context.

Successful operations use the actual Next.js admin login and local Edge/PostgREST/database stack. Fault injection changes transport delivery/timing only. Tests do not clear rights or publish a dictionary.

### Trusted boundary evidence

`npm run test:vtv:local:editorial-sql` creates a new generated `vtv_verify_` database in local PostgreSQL, applies the migrations, runs `tests/supabase/editorial.sql`, then drops that same test database. Assertions cover finalized-only visibility, accent-sensitive collisions, definition filters, bounded keyset pages, provenance, invalid exclusion policy, approval/edit/rejection transitions, same-key receipts, stale revisions, history and browser-role grant restrictions. Existing application database contents are not reset.

The gateway suite separately verifies real role/API denial, cursor tampering and filter binding, concurrent same-key reviews, stale request rejection, edit reset/history and credential-safe errors. The existing contract tests cover bounded inputs and answer/definition policy. These checks complement the browser flow; the SQL suite alone is not an HTTP authorization test.

### Load-capacity limitation discovered during threshold verification

Launching all 121 reads and 31 stale mutations simultaneously did not produce a clean threshold result. One run returned 106 successful reads. A diagnostic repeat returned 89 read successes/32 service-unavailable responses and 25 stale conflicts/6 service-unavailable responses. These were 503s, not evidence of early 429 enforcement. The precise infrastructure failure was not attributed in this pass.

The threshold harness now limits work to five reads and five mutations in flight, retaining the same total requests and exact success/rate-limit assertions. This separates bounded-workload limiter verification from overload testing without suppressing 503s: any 503 still fails the threshold assertions. Unrestricted burst capacity remains unverified and must not be inferred from the bounded test.

## Reproduce

With ticket 02's local stack/function/CORS configuration ready and no competing admin activity:

```powershell
npm run test:vtv:local:browser
npm run test:vtv:local:editorial-sql
npm run test:vtv:local:http -- --editorial-limits
npm test
npm run test:deno
npx tsc --noEmit
npm run lint
npm run build
```

The optional `--editorial-limits` mode waits for existing read/mutation windows to expire instead of deleting rate-limit records. It issues 121 read requests and 31 intentionally stale review requests, with at most five of each in flight, to test the 120-read/30-mutation limits; stale mutations cannot create new revisions. Setup operations honor one existing Retry-After window when needed; threshold assertions do not retry 429/503 responses. Run it after browser checks, since it deliberately exhausts those shared local windows. Run browser and build commands sequentially.

Synthetic import/review/audit records remain in the application database; temporary SQL databases and Auth test users are removed. No application code or migrations required a fix in this pass.

## Scope of acceptance

Ticket 04 is **locally verified** under the previously agreed milestone, with the documented overload limitation. No application correctness defect was exposed and no application fix was made. This is not hosted/production acceptance. Real-source editorial decisions, lineage evidence and rights clearance still require their appropriate reviewers. Hosted gateway/configuration and hosted concurrency remain release checks. Ticket 06 has not been started.
