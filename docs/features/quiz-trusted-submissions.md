# Trusted Quiz submission contract

Ticket 06 introduces the trusted backend contract and ticket 07 adopts it in the browser. The complete replacement is verified only on the disposable local stack. No hosted rollout is authorized or established; the join-quota availability risk described below remains a hosted-deployment blocker.

## Preconditions and setup

The owner confirmed that no Quiz database or data exists. The forward migration intentionally fails if its new relations already exist; reconcile any unexpected target schema before applying it. Session and question creation, question activation, and changes to start times require a trusted operator using privileged database access. Browser roles cannot create or update sessions or questions. Host tooling for those operations is outside this ticket.

The Edge Function requires the platform-provided `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, plus `QUIZ_ALLOWED_ORIGINS`, a comma-separated exact origin allowlist. The function's gateway JWT verification is disabled because player credentials are verified by the trusted submission operation, not Supabase Auth. Only the function's private environment may contain the service key. Run both the migration and the function only on an isolated local project until a separate deployment is authorized.

## Join and identity

POST JSON to `/functions/v1/quiz-submit`:

```json
{"operation":"join","sessionId":"<uuid>","displayName":"Player"}
```

Only a lobby session can be joined. The response contains `sessionId`, `participantId`, and a randomly generated 256-bit `credential`. The credential is the participant's bearer secret: retain it privately for this session, never put it in a URL or broadcast it. Only its SHA-256 digest is stored. It expires 24 hours after creation and can be revoked by a trusted operator through `credential_revoked_at`. A lost or expired credential cannot recover the same participant; join again while the lobby is open. The current endpoint does not provide credential rotation or reconnect recovery.

## Submission and receipt

```json
{"operation":"submit","sessionId":"<uuid>","questionId":"<uuid>","requestId":"<uuid>","selectedOptionIds":["a"],"credential":"<64 lowercase hex characters>"}
```

Requests reject unknown fields, including client-provided participant IDs, correctness, scores, or countdowns. Keep the same request ID and exact selected option array for retries. A successful response contains the stored submission ID, session and question IDs, request ID, selected options, correctness, remaining milliseconds, score, base points, duration, start time, and submission time. Retrying returns that same receipt even after the question expires, subject to credential validity and rate limits. Reusing a request ID with different inputs or another participant returns `RETRY_CONFLICT`; using a new ID for an already answered question returns `ALREADY_SUBMITTED`.

The transaction verifies and locks the credential record, serializes competing requests, validates the active question and option IDs, obtains database time, calculates correctness from the private answer key, and writes the result and audit event together. Credential validation is ordered against revocation by the participant row lock. A private snapshot of the answer key, question type, and options preserves the scoring evidence even if the question changes. The existing formula is `round(basePoints * remainingMs / totalMs)` for correct answers and zero otherwise; remaining time comes from the database clock and is bounded by the trusted start and duration. No grace period is added.

Errors are JSON objects with an `error` string. Invalid requests or options return 400; an invalid, expired, revoked, or cross-session credential returns 401; inactive or expired questions and submission/retry conflicts return 409; limits return 429; and backend failures return 503 without internal details. Join attempts are limited to 120 per session per minute; requests for unavailable sessions share a separate limit of 120 per minute. Valid submissions are limited to 60 per participant per minute; invalid credentials share a separate limit of 600 per minute and cannot exhaust valid participants' buckets. The join limit is shared by players in that session: an unauthenticated caller can deliberately exhaust a room's quota and temporarily prevent legitimate joins. Address that availability risk and review the limits against expected traffic before any hosted deployment.

## Reads and compatibility

`quiz_player_questions` exposes only the current active question and only option ID, label, and value; it never exposes answer keys. `quiz_leaderboard` exposes participant names and aggregated scores. `quiz_sessions` is read-only to player roles and is the only Quiz table added to the Realtime publication. Answer keys, credentials, individual submissions, and audit events remain private. The trusted RPCs are executable only by `service_role`.

For a future authorized rollout: first resolve the join-quota availability risk, reconcile the empty-schema precondition and deploy trusted schema and function together, then deploy the matching browser and verify denial of old direct reads and writes. This migration closes the old question and submission paths, so an older browser is incompatible. Never retain an insecure direct-write fallback.

## Browser behavior

Open `/quiz?sessionId=<uuid>` while the session is in its lobby. The browser asks for a display name and obtains a fresh credential from the trusted join operation. URL participant IDs and names are not identity. Credentials are held only in page memory through the mutation lifecycle; they are never written to a URL, persistent storage, Zustand, or broadcasts. Refreshing or leaving discards the seat, and the join screen explains this limitation. Rejoining requires an open lobby; credential recovery remains outside the contract.

The browser reads explicit public columns from `quiz_sessions`, the active `quiz_player_questions` projection, and `quiz_leaderboard`. Session Realtime events only trigger throttled query invalidation; broadcasts cannot override question selection or timing. Session polling provides recovery from missed events and aggregate leaderboard polling refreshes scores without broadcasting every answer. TanStack Query owns remote state; selections and pending-attempt interaction live in the gameplay hook. The obsolete Quiz Zustand store has no remaining consumers and is removed; no server state is mirrored there.

On submission, the browser freezes the request ID, credential, question and exact selected-option array. While an attempt is uncertain, option changes and new submissions are blocked. An explicit retry resends the same attempt even after expiry or host progression, allowing retrieval of the original receipt. A receipt for an earlier question is labelled accordingly. Both correct and incorrect accepted receipts are final; only their trusted values are displayed. Terminal denial never appears as a confirmed result. Session navigation aborts outstanding work and discards its in-memory identity; there is no direct-write fallback.

## Local verification

Create a separate disposable Supabase project named `quiz-verification` on API port 55321 and database port 55322, apply the migration, serve `quiz-submit`, and set `SUPABASE_CLI` to the local CLI executable. Run `node tests/quiz/local-integrity.integration.mjs`. The test verifies the exact local ports and uses the dedicated `supabase_db_quiz-verification` container, but it creates fixtures, clears its rate limits, and temporarily adds a failing audit trigger; never point it at a project containing valuable data. It covers real Edge HTTP, player-role denial, safe reads, Realtime, scoring, concurrent retries, expiry, rate limits, and transactional audit rollback.

For browser acceptance, keep that isolated stack/function running and include `http://127.0.0.1:3214` in the local function's exact `QUIZ_ALLOWED_ORIGINS` allowlist. Run `npx playwright test --config playwright.quiz.config.ts` with `SUPABASE_CLI` set. The configuration reads the local status internally, rejects other API URLs, and passes only the anon key to its Next.js test server. The browser suite creates unique disposable fixtures through the named local database container and runs real join-to-receipt/leaderboard journeys, lost-response recovery across host progression, incorrect answers, invalid credentials, and client-clock manipulation. Run it sequentially with the integrity suite because the latter deliberately changes shared rate-limit and audit-test state. Neither command accepts a hosted target.
