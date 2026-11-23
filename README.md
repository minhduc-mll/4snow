# 4snow

4snow is one Next.js App Router frontend backed by Supabase. Lucky Draw, Vua tiếng Việt, and Quiz share the application but keep their feature logic separate. Browser code uses public Supabase access; trusted validation and database transactions run in Supabase Edge Functions and SQL. The two admin login and verification route handlers are the documented exception for server-only JWT secrets.

For backend setup and maintenance, see the [Supabase developer guide](docs/supabase.md). It covers local Docker services, reduced-container options, environment variables, migrations, hosted deployment, and recovery.

For GitHub branch protection, Vercel Preview, Dictionary staging QA, and release or rollback, see the [CI and staging runbook](docs/ci-cd-staging.md).

For local Quiz backend setup, see the [trusted Quiz contract](docs/features/quiz-trusted-submissions.md). Dictionary disposable-stack setup and checks are recorded in the [Supabase developer guide](docs/supabase.md).

## Architecture

- `app/` contains routes; `components/atoms`, `molecules`, and `organisms` compose the UI. Hooks coordinate browser interaction and TanStack Query owns remote state. Zustand is for local UI state.
- `hooks/useAdminAuth.ts` owns the browser admin session, storage notifications, and session-loss cleanup. `app/api/admin/` signs and verifies the custom JWT without exposing secrets. See [admin authentication](docs/features/admin-auth.md).
- Vua tiếng Việt uses `lib/vua-tieng-viet/dictionary-contract.ts` for runtime-neutral dictionary rules, `player-engine.ts` and `round-save.ts` for play and historical persistence, and `hooks/useWordInput.ts` / `useWordRound.ts` for input and lifecycle. Private operations use `private-request.ts` and `private-transport.ts`. The `vtv-dictionary` Edge entry point and trusted workflow modules validate and execute private operations; SQL migrations retain atomic publication and audit rules. See [dictionary documentation](docs/features/vua-tieng-viet-dictionary.md).
- Quiz uses `hooks/useQuizJoin.ts`, `hooks/useQuizSystem.ts`, and `lib/quiz/client.ts` for safe reads and trusted receipts. `supabase/functions/quiz-submit` and the Quiz migration verify participant credentials and calculate and persist scores using protected answers and database time. See the [trusted Quiz contract](docs/features/quiz-trusted-submissions.md).
- Lucky Draw remains independent; see [its feature guide](docs/features/lucky-draw.md). Spreadsheet parsing is browser-only.

## Development and verification

Install dependencies with `npm ci`, configure the local environment for the feature under test, and run `npm run dev`. Open http://localhost:3000. Never put service-role keys or admin signing secrets in browser variables.

Run these from the repository root:

```sh
npx tsc --noEmit
npm run lint
npm run build
npm test
npm run test:deno
npm run test:browser
npx deno check supabase/functions/vtv-dictionary/index.ts supabase/functions/quiz-submit/index.ts
```

The Node/Vitest and Deno suites cover domain and runtime contracts. The default Playwright suite uses controlled browser fixtures; mocked endpoints do not prove backend authorization. For real Quiz Edge, direct-role, concurrency, and browser verification, follow the disposable-stack instructions in the [trusted Quiz contract](docs/features/quiz-trusted-submissions.md). Dictionary HTTP/SQL verification is described in the [Supabase developer guide](docs/supabase.md). Production offline and physical Vietnamese IME/device checks are separate from mocked browser tests.

## Deployment boundaries

Migrations are append-only. For a future authorized Quiz rollout, first resolve the documented room join-quota availability risk and reconcile the empty-schema precondition; deploy the trusted schema and Edge function together before the matching browser, then verify that old direct reads and writes are denied. An old browser is incompatible with the protected schema. Do not retain an insecure fallback. Local verification is not a hosted deployment. Dictionary source-rights clearance and real-data release acceptance remain separate gates.
