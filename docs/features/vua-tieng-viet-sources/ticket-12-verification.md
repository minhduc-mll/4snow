# Ticket 12 verification — 2026-11-15

Administrators can load the current draft through publication preview, edit the accepted-guess limit, and save it explicitly as a private draft. The form accepts integers 1–12, describes the default six and fixed levels/accent rules, and disables edits while a mutation or safe retry is pending. New configuration identities and checked draft revisions are returned into TanStack Query. Stale updates require an explicit preview refresh rather than silent rebasing.

The existing Edge boundary now accepts `configuration`, using the shared admin authorization, bounded strict JSON parsing, canonical hashing and editorial mutation limiter. The service-only `vtv_configure` RPC validates the complete input, serializes idempotency/draft updates, generates a configuration UUID, increments the draft revision, and commits audit plus retry receipt atomically. Browser roles cannot execute it. Fixed levels and the normalizer are not accepted as editable inputs.

Saving settings removes stale publication previews/results and invalidates affected private queries. A fresh full-content preview and the existing atomic publication operation apply the new configuration to the current pointer. Existing public releases remain immutable. Initial defaults stay at six; existing draft settings are not reset by this migration.

## Checks

- `node --test tests/vua-tieng-viet/configuration.test.mjs`: 3 focused tests passed for strict request/response contracts and the authorized/rate-limited Edge handler, including stable retry hashing and stale-conflict mapping.
- `node tests/vua-tieng-viet/configuration-sql.integration.mjs`: passed against a newly created disposable database inside `supabase_db_4snow`, then dropped it. Covers defaults and 1/12 boundaries; fractions/0/13/non-number/fixed-rule overrides; idempotency and stale updates; audit content and rollback on audit failure; service-only privileges; draft-versus-live separation; complete settings-only publication with unchanged content/attribution and retained old payload; concurrent edits, concurrent duplicate retries, and edit-versus-publication races.
- Focused browser tests: both configuration journeys and the existing publication journey passed.
- `npm.cmd test`: 56 Node tests + 2 Vitest tests passed (58 total).
- `npm.cmd run test:browser`: 42 passed, 2 skipped. The skips are the separately configured production offline regression and ticket 09's optional native IME check. New journeys exercise local validation, both boundaries, a lost-response retry, draft privacy, fresh-preview publication, concurrent edits and stale publication.
- `npx.cmd tsc --noEmit`: passed during implementation.
- `npm.cmd run lint`: passed.
- `npm.cmd run build`: passed, including strict typechecking. Network permission was needed for the project's existing Google fonts.
- `git diff --cached --check`: passed before commit.

Browser journeys use synthetic Edge responses; SQL integration exercises the actual migration and existing publication functions. The new configuration operation was not deployed to hosted Supabase or exercised through a deployed Edge runtime in this ticket. Apply `20261115000000_vtv_configuration.sql` and deploy the updated `vtv-dictionary` function together before hosted use. Existing feature-flag gating remains. Ticket 13 owns first real release and player snapshot acceptance; source rights and prior hosted verification requirements remain separate.

## Standards

Independent review: **0 findings**. The changes preserve component/hook boundaries and TanStack Query ownership, validate trusted inputs, restrict the RPC to the service role, and keep draft/audit/idempotency updates transactional. The form has an associated label, inline validation and disabled busy/retry states. No actionable documented-standard breaches or baseline smells.

## Spec

Independent review: **0 findings**. Integer attempts, fixed rules, private identity/revision updates, existing authorized/rate-limited/idempotent mutations and audit are implemented. Draft edits invalidate previews without changing live releases; complete settings-only publication preserves old configurations. Tests cover boundaries, rejection, retries, stale concurrency, audit rollback, privacy and old/new separation. No actionable missing requirements, scope creep or incorrect behavior.

Totals: Standards 0 findings (no worst issue); Spec 0 findings (no worst issue).
