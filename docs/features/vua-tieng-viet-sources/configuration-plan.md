# Ticket 12 — draft attempt configuration

Ticket 07 is locally verified; use its accepted local-development scope and reviewed synthetic content. Player snapshot acceptance remains ticket 13. Approved seams are pure request/response validators, the authorized Edge boundary, disposable database integration, and administrator browser journeys.

Types: add `configuration` to the existing publication mutation union with `requestId`, `idempotencyKey`, and input `{ expectedDraftRevision: string; attemptLimit: number }`. Return `{ draftRevision, configuration: { configurationId, attemptLimit, normalizerVersion: vi-nfc-v2, levels: [3,5,7,9] } }`.

Pseudo-code:

1. Strictly accept integer attempts 1–12 at client/Edge/database boundaries; the existing singleton starts at six. Fixed levels and normalizer are not editable or accepted as request overrides.
2. Reuse admin authorization, CORS, bounded parsing, mutation rate limits and canonical request hashing. A service-only database function locks idempotency and the singleton draft, checks the supplied revision, generates a new configuration UUID, advances draft revision, and stores complete immutable audit input/output/configuration. Retried requests return the original result; conflicting payloads/revisions do not mutate anything.
3. Reuse publication preview to load the current draft configuration and revision, even when content is not publishable. Add a labelled attempt editor with local validation, explicit save-draft action, busy/retry/conflict feedback and a fixed-rule description. TanStack Query owns returned configuration state. Do not silently refetch/rebase a pending edit before saving.
4. Successful settings changes remove stale publication previews/results and invalidate affected private queries. Preview again before publishing. Existing publication rebuild/validation and transactional pointer replacement publish a complete snapshot with the new configuration; settings changes never alter existing public releases or active rounds.
5. Exercise boundaries, malformed/fixed-rule overrides, authorization/limits/idempotency, draft/live separation, audit/privacy, stale concurrent edits/previews/publication, safe retry, full-content settings-only publication and immutable old releases. Run narrow checks regularly, full suites, lint/build and independent standards/spec review; commit task files only.
