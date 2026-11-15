# Ticket 02: local verification closure

Verified on 2026-11-14. The selected target is **local Supabase only**, as confirmed by the developer. This supersedes the local CORS, missing-secret, multi-instance, and lint gaps in [the earlier verification pass](local-verification-2026-11-14.md). Hosted deployment remains outside the verified scope.

## Plan and boundaries

Use strict pass/fail HTTP assertions at the real gateway, isolated Edge processes for missing environment variables, and an unmocked browser journey. Preserve the existing typed operation envelope and custom-admin authorization. Change local development tooling only; do not weaken JWT verification, change database grants, reset data, or deploy to hosted Supabase. Keep credentials out of command output and retained artifacts.

## Root cause and local fix

The CLI-generated `functions-v1` Kong service includes a default `cors` plugin. Its wildcard headers and automatic preflight handling override the function's allowlist response. This was reproduced by the original failing integration check. The function already rejects disallowed POST origins.

`npm run supabase:local:cors` reloads the current local gateway configuration with only that service's CORS plugin removed. Other services, request transformation, keys, and function JWT configuration are preserved. Every Edge Function must now handle its own CORS; the dictionary function already does. No generated config or keys are copied into the repository. The script discards Docker/config output because it can contain credentials.

This is a CLI-local workaround, not a hosted configuration change. The generated source config is unchanged: **run the command again after restarting/recreating the local gateway**. A normal Supabase restart restores CLI defaults. The regression test deliberately fails if those defaults reintroduce wildcard CORS.

The function is responsible for preflight and response headers as described in [Supabase's CORS documentation](https://supabase.com/docs/guides/functions/cors). Exact behavior must be rechecked on a hosted gateway before hosted acceptance.

## Verification results

| Check | Result |
| --- | --- |
| Real local gateway allowed preflight | 204, exact allowlisted origin |
| Disallowed-origin preflight | 403, no allow-origin header |
| Allowed POST | Exact allowlisted origin |
| Disallowed-origin POST | 403 |
| JWT rejection matrix | Missing/malformed token, wrong signature/role/algorithm/type, expiry, future `iat`/`nbf`, fractional expiry and invalid timestamp type rejected with 401 |
| Malformed/oversized JSON | 400/413, safe error envelopes |
| Database authorization | Anon and a real Auth-issued authenticated user denied all 13 dictionary RPCs and 15 private tables; temporary Auth user removed |
| Missing environment variables | Four isolated real Edge runtimes failed closed without admin secret, origins, Supabase URL, or service key |
| Cross-instance local limiter | Two separate Edge processes sharing the local database accepted exactly 30 concurrent previews and rate-limited 1, with positive Retry-After, in a fresh window |
| Unmocked browser | Real local Next.js admin login → file preview → local gateway/function/database → valid trusted response → logout cleanup passed; no HTTP response mocking |
| Node/Vitest and Deno suites | 30 Node + 2 Vitest + 2 Deno tests passed |
| Repository lint | Passed after excluding vendored `.agents/skills/**` from application lint targets |
| Strict TypeScript and production build | Passed; build used network access for existing Google Fonts |
| Cleanup and whitespace | No temporary verification containers remained; Git whitespace check passed |

The missing-origin runtime rejects browser origins with 403 before configuration handling; a request without Origin still returns 503. Other missing-secret cases return 503. No privileged requests become authorized by missing configuration. Temporary verification runtimes are stopped/removed; the application's running runtime and secrets are unchanged.

The multi-instance test waits for the current rate-limit window to expire rather than resetting records. It requires no concurrent admin activity. It verifies two local Edge processes against one real local database, not geographically distributed hosted instances.

## Reproduce

Start the existing `4snow` local stack, apply all committed migrations, and serve `vtv-dictionary` with matching local secrets. See [Supabase setup](../../supabase.md). Then:

```powershell
npm run supabase:local:cors
npm run test:vtv:local:http
npm run test:vtv:local:browser
npm run test:vtv:local:runtime
npm test
npm run test:deno
npx tsc --noEmit
npm run lint
npm run build
```

Run browser and build sequentially to avoid sharing a changing Next.js build directory. Integration commands need Docker permissions and the existing generated runtime env file under ignored `supabase/.temp/`. The browser config starts a fresh temporary Next.js server on the first configured loopback HTTP origin and refuses to reuse an existing server. Its temporary admin password and signing secret stay in Node/server environment variables. The ordinary six mocked browser journeys remain available through `npm run test:browser`.

Local integration tests leave clearly synthetic import/review records and append-only audit history in the local database. Do not publish them. No actual source rights are cleared by these tests.

## Remaining acceptance limits

Local verification gaps addressed in this pass are closed. The developer subsequently accepted local-only verification for progression to tickets 03–04; that scope is now recorded in ticket 02 as `locally-verified`. Ticket 02 is not marked globally complete: there is no hosted project reference/configuration or hosted verification evidence, and local evidence must not be represented as hosted readiness. Ticket 06 remains gated on ticket 04's acceptance.
