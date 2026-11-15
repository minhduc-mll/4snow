# Tickets 02–04: local verification, 2026-11-14

## Scope and verification plan

Verify the existing implementation before ticket 06, using synthetic data on the existing local Supabase stack. Do not change application behavior, gateway configuration, or ticket dependencies. Keep local evidence distinct from hosted acceptance.

Execution order: run contract/handler tests and strict typecheck; exercise the real local gateway's authorization and PostgREST permissions; import synthetic candidates with concurrent retries and recover their receipts; review finalized candidates and reject stale revisions; run browser tests, lint, and build. Record unresolved checks rather than marking tickets complete.

The integration harness uses the existing typed operation envelopes (`ImportMutation`, `EditorialRequest`) as its request contract. It reads local runtime credentials internally, signs a custom admin JWT, and exercises HTTP operations through Kong. It does not print keys or JWTs. A real Supabase Auth user is created for authenticated-role denial checks and removed in `finally`. Synthetic dictionary records and their append-only audit history remain in the local database; no database reset, migration rewrite, or rate-limit deletion is performed. Run this only on a local development stack with no concurrent administrative activity.

## Fresh results

| Check | Result |
| --- | --- |
| `npm.cmd test` | Passed: 30 Node tests and 2 Vitest tests |
| `npm.cmd run test:deno` | Passed: 2 tests |
| `npx.cmd tsc --noEmit` | Passed |
| `npm.cmd run test:browser` | Passed: all 6 cases, clean exit (19.3 seconds); Supabase and login responses are mocked |
| `npm.cmd run build` | Passed with network access for existing Google Fonts |
| `npm.cmd run lint` | Failed: 15 `no-require-imports` errors and 1 unused-variable warning in existing `.agents/skills/brand` and `.agents/skills/design-system` scripts |
| Focused ESLint for new integration harness | Passed |
| Git whitespace check | Passed |

### Real local Supabase HTTP checks

The integration harness at [local-supabase.integration.mjs](../../../tests/vua-tieng-viet/local-supabase.integration.mjs) completed these checks against `http://127.0.0.1:54321`:

- Missing, malformed, wrong-signature, wrong-role, expired, future-issued, and wrong-algorithm custom JWTs returned 401.
- A disallowed POST origin returned 403. Allowed preflight succeeded; malformed duplicate-key JSON returned 400 and an oversized body returned 413. Checked error responses did not contain the admin signing secret, service key, or custom admin token.
- Both anon and a real Auth-issued `authenticated` user token received PostgreSQL permission-denied responses for all 13 public `vtv_*` routines. All 15 private `vtv_*` tables were unavailable through PostgREST's private profile (`PGRST106`). The temporary Auth user was removed.
- Trusted preview validated a fresh synthetic two-entry chunk and agreed with the canonical SHA-256 hash.
- Concurrent import starts and concurrent same-key chunk applies returned identical receipts. Starting again recovered the session and its receipt. Finalization with missing chunks returned 409; successful finalization and same-key retry returned the same final receipt.
- Finalized synthetic candidates were queried using their database-assigned source identity. Filtered collision pagination returned distinct entries; tampered and filter-mismatched cursors returned 400.
- Detail, approval, concurrent same-key review retries, stale review rejection (409), definition edit clearing approval/answer eligibility, and revision history passed through the actual Edge/PostgREST/database path.
- A 31-request concurrent preview burst produced rate-limit responses with positive `Retry-After`. No more than 30 succeeded. This verifies local shared limiting, not separate deployed instances or a freshly reset exact 30/31 boundary.

### Gateway CORS gap

**The local gateway returned `Access-Control-Allow-Origin: *` for both preflight and successful POST responses.** The handler source returns the selected origin, and actual disallowed-origin POSTs were rejected. The observed gateway behavior still does not establish exact allowlisted CORS headers at the public endpoint. Inspect the gateway configuration before accepting this criterion; do not weaken authorization to resolve it.

The harness originally expected exact function-level CORS headers and failed at that assertion. It now continues the other independent checks, prints this gap, and returns a nonzero exit status when the wildcard is observed. This is an unresolved verification result, not a passing CORS assertion.

## Reproduce

With the existing `4snow` local stack running, all four dictionary migrations applied, and its function served with matching local secrets:

```powershell
node tests/vua-tieng-viet/local-supabase.integration.mjs
```

The harness expects the CLI-generated local runtime env file at `supabase/.temp/start-secrets/supabase_edge_runtime_4snow/env/docker.env` and database container `supabase_db_4snow`. This is deliberately local-only and CLI-layout dependent. Do not copy this file into source control or point this harness at production. It requires Node with native TypeScript import support, Docker access, and the gateway at port 54321. Each HTTP request has a 15-second timeout. Run after the previous shared rate-limit window expires; a preceding run or concurrent admin activity can affect the result.

## Ticket disposition

| Ticket | Status after verification | Remaining work |
| --- | --- | --- |
| 02 | Partial | Resolve/verify gateway CORS; verify missing-secret fail-closed behavior against a separately configured runtime; complete the deployed security matrix and cross-instance limiting; resolve repository lint gate |
| 03 | Partial | New real anon/authenticated denial and HTTP retry/finalization evidence closes part of the gap. Still needs unmocked browser resume/finalization, lost-response transport recovery (rather than merely repeated successful HTTP requests), deployed recovery/concurrency checks, and prerequisite 02 closure |
| 04 | Partial | New real HTTP cursor/review/history/concurrent retry evidence closes part of the gap. Still needs unmocked browser-to-Supabase workflows, competing different-key stale edits under deployed concurrency, and prerequisite 03 closure |

The four SQL suites were not rerun in this pass; their earlier November 14 results remain historical evidence. The current harness exercises real local roles and gateway calls but is not exhaustive coverage of every acceptance criterion. No hosted deployment was changed or verified. Tickets 01/05, real-source rights clearance, and ticket 06 implementation remain outside this pass.

Next: address ticket 02's concrete verification gaps first, then the remaining 03 and 04 browser/deployment checks. Do not mark 02–04 complete or start 06 under the current blocker policy yet.
