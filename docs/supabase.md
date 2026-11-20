# Supabase developer guide

This guide covers local development, optional container reduction, hosted deployment, and routine maintenance for 4snow. Run commands from the repository root in PowerShell. Examples use `npx supabase`; the CLI is not currently pinned in package.json. Record `npx supabase --version` when troubleshooting, and agree on a CLI version before upgrading a shared workflow.

The root `.gitignore` excludes generated `supabase/.temp/` and `supabase/.branches/` directories. These directories hold CLI state and can contain credentials.

## What this repository actually provisions

| Source | Responsibility |
| --- | --- |
| `lib/supabase.ts` | Typed browser client and public environment configuration |
| `supabase/config.toml` | Dictionary function gateway configuration |
| `supabase/functions/vtv-dictionary/index.ts` | Trusted dictionary operations using a custom admin token |
| `supabase/migrations/` | Dictionary rate limits, import records, editorial review, and rights review |
| `tests/supabase/` | SQL checks for dictionary behavior and database privileges |
| `types/database.ts` | Browser database types; types alone do not create tables |

**Bootstrap gap:** the four committed migrations provision the dictionary backend, not the complete application database. Quiz code references `quiz_sessions`, `quiz_questions`, `quiz_submissions`, and `participants`, but their creation, RLS policies, and Realtime publication are not supplied by these migrations. A fresh local or hosted database is therefore not a complete quiz installation. Before enabling quiz features, obtain the intended schema from the project owner, review its grants/RLS and Realtime configuration, and commit reproducible migrations. Do not guess permissive policies to make errors disappear.

The committed config currently contains only:

```toml
[functions.vtv-dictionary]
verify_jwt = false
```

It does not explicitly pin a local project ID, ports, or optional services. Preserve this function setting if generating a fuller config. It is intentional: admin login issues a custom JWT through `/api/admin/login`, and the Edge Function independently verifies it. This token is not a Supabase Auth session. See [admin authentication](features/admin-auth.md).

## Why Docker starts many containers

The local CLI runs the Supabase platform as separate services. They are not duplicate 4snow applications. Hosted Supabase operates these services remotely, so using a hosted project does not require the local stack.

| Container suffix/prefix | Service | Current relevance |
| --- | --- | --- |
| `db` | PostgreSQL | Stores tables, RPCs, migration history, and audit records |
| `kong` | API gateway | Routes browser and function requests |
| `rest` | PostgREST | Database API and dictionary RPC calls |
| `realtime` | Realtime | Quiz subscriptions and shared broadcasts |
| `edge_runtime` | Edge Functions | Dictionary trusted operations |
| `studio` | Supabase dashboard | Optional developer administration UI |
| `pg_meta` | PostgreSQL metadata API | Supports Studio administration |
| `analytics` | Logflare analytics | Optional local log tooling |
| `vector` | Log forwarding | Optional logging pipeline; not vector search |
| `auth` | Supabase Auth | Bundled service; current admin login uses custom auth |
| `storage` | Storage API | Bundled service; dictionary import storage currently uses database records |
| `inbucket` / `mailpit` | Development email inbox | Useful for Auth email testing; name depends on CLI version |

The supplied Docker screenshot shows approximately 1.6 GB used by 4snow, including about 554 MB for analytics. The group memory limit is an aggregate display, not the amount of memory actually consumed. Container counts and names vary by CLI version. See [local development](https://supabase.com/docs/guides/local-development).

## Local setup: full stack

1. Install Node.js compatible with the project's Next.js version and the Supabase CLI requirements, Docker Desktop with Linux containers, and optionally PostgreSQL client tools (`psql`) for SQL checks. Start Docker Desktop.
2. Install the application dependencies and start Supabase:

   ```powershell
   npm ci
   npx supabase --version
   npx supabase start
   npx supabase status
   ```

   The first start downloads images. Use the URLs and keys printed for your stack; default API and Studio ports are usually 54321 and 54323. Status output contains credentials: do not paste it into tickets or commit it. Startup initializes a fresh database from migrations; for an existing database apply pending migrations with `npx supabase migration up --local`.

   If your CLI rejects the minimal committed config, generate a reference config using `npx supabase init` in a separate temporary directory. Merge the required local sections into this repository's config, set `project_id = "4snow"`, preserve the function section above, and review the diff. Do not force-overwrite the repository config or delete migrations. Resolve port conflicts by configuring distinct ports/project IDs.

3. Create `.env.local` with values from your local stack:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<local-anon-key>
   NEXT_PUBLIC_VTV_IMPORT_ENABLED=true
   ADMIN_USERNAME=<local-admin-name>
   ADMIN_PASSWORD=<local-admin-password>
   ADMIN_JWT_SECRET=<strong-local-only-secret>
   ADMIN_TOKEN_EXPIRES_IN=12h
   ```

   The browser client fallback key is a placeholder and cannot replace a real key. Use the project's anon key for this existing integration. Never put a service-role key or admin secret in a `NEXT_PUBLIC_` variable. Existing `.env` values may also be loaded by Next.js; verify `.env.local` points to the intended environment.

4. Create a separate root `.env.supabase.local` for the Edge Function:

   ```dotenv
   ADMIN_JWT_SECRET=<same-local-secret-as-Next.js>
   VTV_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
   ```

   The CLI supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` inside its local Edge runtime. Do not replace the internal URL with the host's localhost address. Both environment files match the repository's `.env*` ignore rule; confirm they remain ignored before committing.

5. Serve the dictionary function in one terminal and Next.js in another:

   ```powershell
   npx supabase functions serve vtv-dictionary --env-file .env.supabase.local
   ```

   ```powershell
   npm run dev
   ```

6. Open `/admin`, sign in, and exercise the dictionary UI. Check the browser network panel for calls to `/functions/v1/vtv-dictionary`. Confirm valid admin requests succeed and missing/invalid tokens are rejected. Test an allowed origin and a disallowed origin. Do not treat a successful deployment or startup as authorization verification.

Changing Next.js environment values requires restarting development, or rebuilding and redeploying the hosted frontend. Changing local function secrets requires restarting the function serve command.

## Optional reduced-container development

### Dictionary CORS verification

The CLI's default local Kong CORS plugin can override the dictionary function's origin allowlist. For this project's strict local checks, run `npm run supabase:local:cors` after starting/restarting Supabase. This delegates function-route CORS to the Edge Functions while preserving other gateway services. It is a reversible local runtime reload, not a hosted change. Verify with `npm run test:vtv:local:http`; the test requires exact allowed origins and denied preflights. See [ticket 02 verification](features/vua-tieng-viet-sources/ticket-02-verification.md) for the full local HTTP, isolated-runtime and unmocked-browser commands.

Start with the full stack to establish that the project works. For everyday development, the first reduction to try is logging services:

```powershell
npx supabase stop
npx supabase start --exclude logflare,vector
```

To also omit Studio and its metadata service:

```powershell
npx supabase stop
npx supabase start --exclude logflare,vector,studio,postgres-meta
```

The exclude flag uses **service identifiers**, which differ from Docker container names (`analytics` corresponds to `logflare`). Check `npx supabase start --help` for your installed CLI. These are optional profiles to verify locally, not profiles automatically tested by this documentation change. Some versions or tooling have service dependencies; return to the full stack if health checks or required workflows fail.

Keep PostgreSQL, Kong, PostgREST, Edge Runtime, and Realtime for the current combined dictionary/quiz workflows. The project does not currently use Supabase Auth login, Storage API uploads, or email testing, but remove those services only after checking CLI dependencies and smoke-testing every workflow you need. No reduced profile changes hosted services.

Without Studio, use `psql` and SQL migrations for administration. Without analytics/vector, the Studio logging experience is unavailable or reduced; use the function serve terminal and targeted `docker logs <container-name>` instead. Logs can contain sensitive inputs: redact before sharing.

Restore the full stack with `npx supabase stop` followed by `npx supabase start`. Normal `stop` preserves local data. Avoid Docker volume deletion/pruning and `stop --no-backup` when data matters. The [CLI reference](https://supabase.com/docs/reference/cli/introduction) documents exclusions and lifecycle behavior.

## Migrations and database verification

Apply files in timestamp order:

1. `20261108000000_vtv_preview_limit.sql`
2. `20261108000001_vtv_import_storage.sql`
3. `20261108000002_vtv_editorial.sql`
4. `20261108000003_vtv_rights_review.sql`

Create future changes with `npx supabase migration new <descriptive_name>`. Write explicit SQL, keep RLS enabled, and grant only the required roles. Dictionary private tables must remain inaccessible to browser roles; privileged RPCs are for `service_role` through the trusted function. Keep timestamps, inputs, outputs, configuration, and review/audit history intact. Do not edit migrations already applied to shared environments: add a corrective migration.

For a clean rebuild of **disposable local data only**:

```powershell
npx supabase db reset --local
```

This deletes and recreates local database contents, then replays migrations. Back up valuable data first. Never use a remote reset as a deployment step.

Run the existing SQL checks against a disposable local database after applying all migrations. Substitute the connection URI reported by `supabase status` if different:

```powershell
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f tests/supabase/preview-limit.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f tests/supabase/import.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f tests/supabase/editorial.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f tests/supabase/rights-review.sql
```

Also run `npm run lint`, `npm run build`, and the feature's relevant tests (`npm test`, `npm run test:deno`, or `npm run test:browser`). SQL checks do not replace gateway, CORS, real-role, or concurrent hosted rate-limit testing.

## Hosted Supabase setup and deployment

Use separate development/staging and production projects. Hosted use requires no local Docker stack for normal frontend work; CLI database operations may still need Docker. A local config is not automatically a complete hosted project configuration.

1. Create/select the intended Supabase project in the dashboard. Record its project reference and environment in team documentation without credentials.
2. Authenticate and link from this repository:

   ```powershell
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase migration list --linked
   npx supabase db push --linked --dry-run
   ```

   Confirm the linked project and pending files before proceeding. For an existing database with dashboard-only changes, first reconcile schema and migration history using a reviewed `db pull` workflow. Do not blindly mark migrations applied or push over an unknown baseline.
3. Back up an existing target, then apply reviewed migrations:

   ```powershell
   npx supabase db push --linked
   ```

4. Create root `.env.supabase.production` (ignored by Git), containing the production `ADMIN_JWT_SECRET` and exact comma-separated HTTPS frontend origins in `VTV_ALLOWED_ORIGINS`. Use a distinct secret from local development. Set secrets and deploy:

   ```powershell
   npx supabase secrets set --env-file .env.supabase.production --project-ref <project-ref>
   npx supabase functions deploy vtv-dictionary --project-ref <project-ref>
   ```

   Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the hosted function. Keep `verify_jwt = false` for this function and retain its custom token validation. Disabling gateway JWT validation is not permission to remove application authorization.
5. Configure the frontend host with the hosted project URL and anon key, the dictionary feature flag, and the private admin variables from the local example. The frontend's production `ADMIN_JWT_SECRET` must match the function's production secret. Redeploy the frontend after changing public variables.
6. Verify valid/invalid/missing tokens, allowed/disallowed origins, denied browser access to private data/RPCs, import/review behavior, retry/idempotency behavior, and rate limits in staging. Check hosted function logs for missing secrets or RPC errors. Only then enable the feature in production.

Local success does not establish hosted readiness. See the existing [preview verification notes](features/vua-tieng-viet-sources/preview-plan.md). Quiz deployment additionally requires the missing schema/RLS/publication migrations described above.

## Routine operations and recovery

| Task | Procedure |
| --- | --- |
| Start/stop local work | `npx supabase start` / `npx supabase stop` |
| Inspect local endpoints | `npx supabase status` (contains credentials) |
| Review pending changes | `migration list --linked`, then `db push --linked --dry-run` |
| Inspect hosted failures | Dashboard Edge Function logs, database logs, and migration history |
| Rotate admin signing secret | Update frontend private env and function secret together; restart/redeploy both; existing tokens require login again |
| Change allowed frontend origin | Update `VTV_ALLOWED_ORIGINS`, restart local serving or set hosted secrets, then test CORS |
| Undo a bad schema change | Apply a reviewed forward-fix migration; use a verified backup restore for data loss |

For database backups, use the hosted dashboard's backup/PITR capabilities appropriate to the project plan, or follow the [official backup/restore procedure](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore). A migration directory is not a data backup. A schema-only dump is not a data backup either. Include the `private` dictionary schema, data, required roles/grants, and migration history in your recovery plan; retain Edge Function source and configuration separately. Storage objects, if introduced later, need their own backup beyond database metadata. Keep backups outside Git with restricted access and test restoration into a separate project before relying on them.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Connection refused | Docker and stack running; correct API URL/ports; frontend not pointing at stopped local services |
| Invalid API key | URL and anon key from the same project; replace placeholder; restart/rebuild frontend |
| Function 401 | Admin login/token expiry; matching signing secrets; application custom JWT verification; correct deployed gateway setting |
| Browser CORS failure | Exact scheme/host/port in `VTV_ALLOWED_ORIGINS`; local `localhost` differs from `127.0.0.1` |
| Function backend/rate-limit unavailable | Function platform env present; all migrations applied; RPC exists and grants match |
| Quiz relation missing | Known schema bootstrap gap; obtain and migrate the intended schema |
| Realtime does not update | Realtime service running; subscription errors; table publication, RLS, and role permissions |
| Studio logs unavailable | Analytics/vector excluded or unhealthy; inspect runtime/container logs |
| Ports already occupied | Another Supabase project running; inspect Docker and configure distinct local ports |
| CLI differs from this guide | Check version and command `--help`; review upgrade notes before changing shared workflow |

## References

- [Supabase CLI installation and requirements](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [CLI commands and flags](https://supabase.com/docs/reference/cli/introduction)
- [Local configuration](https://supabase.com/docs/guides/local-development/cli/config)
- [Migration workflow](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Project execution rules](../AGENTS.md)

This guide documents the repository configuration and recommended operating steps. It does not assert that a hosted project has been deployed or that the optional reduced container profiles have passed integration tests.
