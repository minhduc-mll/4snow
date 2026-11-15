# Ticket 03 local recovery verification

## Accepted scope and plan (2026-11-14)

The developer accepted ticket 02's local verification as sufficient to proceed with 03–04 while retaining hosted checks as a release requirement. Verify ticket 03 first; do not start ticket 06 or change ticket 04 in this pass.

Use a unique synthetic two-chunk `ImportDocument` artifact. Real login and every successful operation must reach the existing local Edge/PostgREST/database stack. Inject transport failure only **after** the backend has committed an operation, then let the UI retry with the original idempotency key. Keep typed `ImportStartMutation`, `ImportApplyMutation`, and `ImportFinalizeMutation` envelopes; parse observed network responses as `unknown` with runtime narrowing. Never retain JWTs, credentials, or private network traces.

Pseudocode:

1. Log in using the local test server's temporary admin credentials; preview chunk zero.
2. Start an import and capture its identifier. Send apply to the real backend, confirm success, discard its response before delivery to the browser, and assert the UI offers safe retry. Retry and assert equal keys/receipts.
3. Reload the page to remove in-memory session state, reselect chunk one, and start/resume. Assert the same import and persisted receipt are recovered. Upload the remaining chunk.
4. Finalize against the real backend, discard the committed response, and retry. Assert the original key/receipt are preserved and the UI reports exactly two new candidates.
5. Reopen the finalized import to confirm its status/receipts persist. Use direct HTTP/SQL evidence for conflicts, atomicity, roles, reimports and audit history. Fix only demonstrated defects, then rerun relevant tests, typecheck, lint and build.

Synthetic import/audit records remain local; no hosted deployment or real-source rights clearance is implied.

## Fresh execution results

| Verification | Result |
| --- | --- |
| Real browser recovery journey | Passed: two chunks, committed apply response lost, same-key receipt retry, reload/resume with the same import and first receipt, remaining upload, committed finalize response lost, same-key final receipt retry, exactly two created candidates, and finalized session recovery after another reload |
| Real browser preview journey | Passed alongside import recovery; both local-browser cases exited cleanly in 7.4 seconds |
| Disposable import SQL suite | Passed after applying all four migrations to a newly created local database; database removed afterward |
| Node/Vitest tests | Passed: 30 Node and 2 Vitest tests |
| Deno tests | Passed: 2 tests |
| Strict TypeScript | Passed |
| Repository lint | Passed |
| Production build | Passed |
| Git whitespace check | Passed |

The browser test in [import.spec.ts](../../../tests/local-browser/import.spec.ts) sends the actual operation to Supabase with `route.fetch`, validates that the real backend returned 200, then aborts only delivery to the browser. On retry it forwards to the backend again, compares the original mutation key and committed receipt, and delivers that actual response. No synthetic success payload or mocked login is used. This distinguishes lost-response recovery from a request that failed before reaching the server.

The import SQL suite covers role/schema/table/function restrictions, apply-rate limiting, missing and changed chunks, artifact mismatches, idempotency, stale draft revisions, unchanged reimports, changed-content rollback, conservative trusted-lineage supersession, definitive counts after interleaved imports, source-metadata consistency, duplicate identities and audit configuration snapshots. It runs against the real local PostgreSQL engine and existing role definitions, but in a separate disposable database; it does not replace the real-token PostgREST denial evidence from [the local gateway checks](local-verification-2026-11-14.md).

No application defect was exposed in this pass; application code and migrations were unchanged. The new SQL runner creates only a database with a generated `vtv_verify_` name and removes that same database in `finally`. Existing development data is not reset.

## Reproduce

With the local stack/function and ticket 02's CORS configuration ready:

```powershell
npm run test:vtv:local:browser
npm run test:vtv:local:import-sql
npm test
npm run test:deno
npx tsc --noEmit
npm run lint
npm run build
```

Run browser checks and builds sequentially. The recovery browser test is bounded at 120 seconds and honors a preceding preview rate-limit window instead of resetting shared limit records. Do not run competing admin mutations during the test: finalization intentionally checks the shared draft revision.

## Disposition

Ticket 03 is **locally verified** for the agreed development milestone. Ticket 02's local acceptance is explicitly recorded in its ticket. Ticket 04 can proceed to local verification under that same scope; ticket 06 remains untouched until 04 is accepted.

Hosted gateway behavior, hosted role configuration and hosted multi-instance recovery remain release checks. Real-source automatic supersession still requires independently verified lineage attestations; synthetic fixtures do not establish them. This pass does not authorize publication of real or synthetic dictionary data.
