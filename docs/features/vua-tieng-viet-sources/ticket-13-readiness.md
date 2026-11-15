# Ticket 13 readiness audit — 2026-11-15

**Disposition: blocked; no real-data release is accepted.** This is prerequisite/readiness evidence, not completion of the admin-to-player real-data rehearsal. The issue-tracker rule says a ticket can start only after its blockers are resolved. No real source was cleared, imported, approved or published during this audit, and no production or unidentified hosted project was changed.

## Prerequisite and external gates

| Gate | Current evidence | Required next evidence |
| --- | --- | --- |
| Ticket 01 / source pinning | Still in progress. Retained bytes and candidate locations validate locally; [investigation](investigation.md) explicitly says the mutable listing has not been independently matched to the extraction/dump/tool revisions. | Archived/pinned source metadata independently matched to the retained artifact. |
| Qualified rights review | The source ledger records no reviewer, review date or clearance. Synthetic rights tests do not clear real data. | Recorded reviewer decision and applicable attribution/history/modification/redistribution obligations for the selected material. |
| Real editorial/collision decisions | The 12 candidate senses are a review seed, not an approved release. The running local database has zero sources matching the retained artifact digest. | Reviewed eligible guesses/answers at all four levels, exact selected definitions and resolved collisions; retained real receipts/audit references. |
| Ticket 06 | Locally verified implementation; current disposable collision/publication SQL passes. Its ticket still retains deployed verification. | Evidence from the designated non-production real-data workflow; local synthetic checks are not that workflow. |
| Ticket 09 | Still in progress. Automated composition/viewport/focus journeys pass; physical Windows Vietnamese IME and device keyboard checks remain open. | Real IME and phone keyboard/viewport verification with recorded results. Do not replace it with synthetic composition. |
| Tickets 11 / 12 | Resolved; current cross-tab and configuration tests pass. | Demonstrate their combined behavior against the actual accepted release during rehearsal. |
| Non-production target | Local Docker Supabase is available. No hosted target has been explicitly designated for this rehearsal in the request or inspected project evidence. No `supabase/.temp/project-ref` is present. | Identify the permitted non-production project/deployment and its configuration, without putting credentials in evidence. |
| Local deployment readiness | Database migration history stops at `20261108000003`; collision, publication and configuration migrations are not applied there. The Edge container was initially stopped. | Prepare/verify the intended non-production deployment with all migrations and the matching Edge function. |
| Vendored skill-script lint | Explicit `--no-ignore` recheck still reports **15 errors and 1 warning** in the seven known brand/design-system CJS scripts. Repository lint passes only with the existing exclusion. | Resolve these errors or obtain an explicit documented release-gate decision; this audit retains them as blockers. |
| Gateway CORS | Actual local gateway returns preflight status **200** and `Access-Control-Allow-Origin: *`; the direct suite expects **204** and the selected allowed origin. | Resolve and verify exact allowlisted CORS behavior at the actual deployment endpoint. Do not weaken authorization or silently relax the test. |

Missing sign-off, physical verification and target information were requested from the user while independent checks continued. No replacement evidence was supplied during this audit. These are open gates, not assumed approvals.

Underthesea remains deliberately omitted: no independently verified lexical dataset/revision and rights have been established. The existing omission does not block a separately cleared Kaikki-only release.

## Retained source references

- Artifact ID: `78b9536a-5fe6-4849-a2c1-51a922ff8de7`.
- Retained gzip: `data/vua-tieng-viet/kaikki-1f0abd21982660b5fc2eff5eb3fbacbed2d9fe8f476af794dbed0d927ffb8187.jsonl.gz`, 34,422,366 bytes.
- Gzip SHA-256: `1f0abd21982660b5fc2eff5eb3fbacbed2d9fe8f476af794dbed0d927ffb8187`; the contract suite rechecks the byte digest and exact record/sense matches.
- Candidate chunk: `data/vua-tieng-viet/candidates-000.json`; normalizer `vi-nfc-v2`; 12 senses, three candidates at each of levels 3/5/7/9.
- Candidate canonical SHA-256: `25638ee5f28c1af7a5ae85c082d2d8e07b27ff7abaf1a17013e875c70cb13092`.

These references establish retained-byte integrity and candidate locations, not independent upstream lineage, editorial suitability or legal clearance. See [source investigation](investigation.md) and [source preparation plan](plan.md). No real import receipts, clearance/editorial event IDs, build ID, publication audit ID, release ID or payload hash were issued by this audit; those must be retained during the actual rehearsal.

## Fresh automated results

| Command/check | Result and scope |
| --- | --- |
| `npm.cmd test` | Passed: 56 Node tests and 2 Vitest tests. Includes retained source-byte/candidate checks, strict contracts, handler authorization, gameplay, persistence and publication/configuration boundaries. |
| `npm.cmd run test:deno` | Passed: 2 tests. Normalization/hash parity and direct localhost HTTP against an injected Deno handler; not the public Supabase gateway. |
| `npx.cmd deno check supabase/functions/vtv-dictionary/index.ts` | Passed. |
| `npm.cmd run test:browser` | Passed: 42; skipped: 2. Supabase/login responses are synthetic/mocked. Covers 320px/375px nine-letter layouts, short viewport, reduced motion, keyboard/variant focus, non-color feedback, active-round release pinning, corrupt-save recovery, cross-tab choices and other-game route independence. Native IME is not established. |
| `npx.cmd playwright test --config playwright.offline.config.ts` | Passed (1 test, exit 0) against a production build with synthetic public fixture settings: actual browser offline reload, language changes without a reload loop, restored input, completion and online-only replay. The task-owned test server was stopped after the passing test to release Playwright’s output pipe. |
| `node tests/vua-tieng-viet/collision-sql.integration.mjs` | Passed in a disposable local database; dropped afterward. |
| `node tests/vua-tieng-viet/publication-sql.integration.mjs` | Passed in a disposable local database; complete payload/hash/public-role validation, transaction failure, concurrent publication and immutable old releases. Database dropped afterward. |
| `node tests/vua-tieng-viet/configuration-sql.integration.mjs` | Passed in a separate disposable database; boundaries, checked drafts, privacy, audit rollback, retries and edit/publication concurrency. Database dropped afterward. |
| `node tests/vua-tieng-viet/local-runtime.integration.mjs` | Passed. Four missing-secret cases fail closed; two isolated actual Edge runtimes share one local database limiter: exactly 30 preview successes and one limited request in a fresh window. Temporary runtimes cleaned up. This is local cross-instance evidence, not hosted scaling acceptance. |
| `node tests/vua-tieng-viet/local-supabase.integration.mjs` | Failed, retained as a blocker. Initially 503 versus expected 401 with the local runtime stopped. After temporarily starting it, token-denial checks progressed but the suite stopped on preflight 200 versus expected 204. The remaining import/review/recovery part did not run. |
| Separate scoped local HTTP access audit | Passed valid custom-admin `list` access and checked response exclusion of the token/signing secret/service key. An anon token and a real Auth-issued authenticated user were denied all **13 currently deployed RPCs** and access through the private profile for **15 tables**. Temporary Auth user removed. This does not validate newer, unapplied RPCs on this deployment; the disposable SQL suites cover their grants locally. |
| `npx.cmd tsc --noEmit` | Passed. |
| `npm.cmd run lint` | Passed on the current working tree using the pre-existing, uncommitted exclusion of vendored `.agents/skills/**`. This does not establish that the old skill-script errors were repaired. |
| Explicit vendored-script lint (command below) | **Failed: 15 `no-require-imports` errors and 1 unused-variable warning**. The previously observed errors were directly rechecked and remain release blockers; no script or lint rule was changed by this audit. |
| `npm.cmd run build` | Passed with synthetic public browser-fixture settings and network access for the project's existing Google fonts. Earlier font-fetch failure was rechecked, not silently ignored. No environment files were edited. |

Explicit script-lint recheck:

```powershell
npx.cmd eslint --no-ignore .agents/skills/brand/scripts/validate-asset.cjs .agents/skills/brand/scripts/inject-brand-context.cjs .agents/skills/brand/scripts/extract-colors.cjs .agents/skills/brand/scripts/sync-brand-to-tokens.cjs .agents/skills/design-system/scripts/validate-tokens.cjs .agents/skills/design-system/scripts/generate-tokens.cjs .agents/skills/design-system/scripts/embed-tokens.cjs
```

The separate local HTTP access audit used credentials internally and printed only status/count information. It performed no import, editorial mutation or publication. The isolated runtime suite consumed local preview rate-limit state. The existing Edge container was temporarily started for gateway checks and returned to its original stopped state. No temporary verification runtimes remain. No source clearance or production deployment follows from these tests.

## Remaining rehearsal sequence

1. Close source pinning, qualified rights and physical input gates; confirm the permitted non-production target. Follow the issue-tracker blocker policy before starting the rehearsal.
2. Prepare the matching database migrations/Edge deployment and verify its gateway CORS, custom JWT denial/success, anon/real-authenticated permissions and cross-instance limits.
3. Import the approved pinned artifact, retain receipts, complete real rights/entry reviews and collision choices, then generate and validate the full payload. Retain reviewer decisions and audit/build/release references without secrets or private notes.
4. Publish only to the designated non-production target. Exercise a pinned active round across content and attempt-limit publication, actual offline refresh, a later online round from the new pointer and corrupt-save recovery in the same real workflow.
5. Recheck the required tooling/security/browser gates and explicitly retain any failure as a release blocker. Production publication, account features, rollback/deletion controls, multiplayer and rankings remain outside this ticket.

## Workspace evidence dependencies

The local HTTP/runtime harnesses and prior local verification notes are pre-existing uncommitted workspace files. They were not rewritten or bundled into this audit commit. Their results describe this workspace, not reproducibility from a clean checkout that lacks those files. The current ESLint exclusion is likewise pre-existing and uncommitted; see the lint row above. The separate scoped HTTP access audit reused the same local credential-loading/custom-JWT and real-Auth/RPC/private-profile checks without bypassing or changing the failing gateway suite. No real receipts or reviewer decisions were fabricated to fill the missing gates.

## Standards

Independent review: **0 findings**. The record preserves the issue-tracker blocker policy, keeps real acceptance criteria open, separates local/mock/disposable evidence from real-data acceptance, discloses workspace-only dependencies, and contains no credentials or answer-bearing records. No actionable documented-standard breaches or baseline smells.

## Spec

Independent review found **one evidence correction**: repository lint's exclusion did not recheck the previously failing skill scripts. The explicit `--no-ignore` run above corrected that evidence, and its 15 errors/1 warning remain blockers. Follow-up review found **no remaining documentation corrections**.

Four acceptance gaps remain: cleared/reviewed real data and real release references; the intended deployment's security/configuration/CORS verification; the combined real-data publication-to-pinned-player workflow; and physical IME/mobile verification. The explicit skill-script lint failure is an additional retained release gate. Keeping ticket 13 blocked is intentional and does not waive any criterion.

Totals: Standards 0 findings; Spec 1 corrected evidence issue, no remaining documentation corrections, 4 acceptance gaps plus the lint blocker retained. Worst retained Spec blocker: real-data source/rights clearance. No real-data release acceptance is claimed.
