# Vua tiếng Việt: preparing a staging environment

This guide prepares an owner-designated **separate Supabase staging project** and a **Vercel Preview** for ticket 17 and the eventual ticket 13 rehearsal. It creates nothing and records no deployment. Use synthetic data until source provenance, qualified rights review and editorial approval are complete. Do not paste passwords, tokens, signing secrets, service-role keys or database connection strings into chat, tickets, screenshots, logs or Git. The owner should enter secrets directly in provider dashboards or use an approved private secret-management channel.

## 1. Identify isolated targets

1. In Supabase, create or designate a separate project for staging. Confirm its project reference and URL differ from production, and that it contains no production data. Record the staging project reference and URL; check the organization, project name, region and access with the owner. Do not assume a name alone proves isolation.
2. In Vercel, designate the application project and a non-production Git branch/Preview deployment. Confirm its branch is not the production branch, its Supabase URL points to the staging project, and its hostname is not a production domain. Restrict access as appropriate. A Preview deployment is generated for a non-production branch; record its exact HTTPS origin and commit. Preview environment changes apply only to new deployments ([Vercel environments](https://vercel.com/docs/deployments/environments), [environment variables](https://vercel.com/docs/environment-variables)).
3. Before changing any database, have the owner verify the project reference and migration history, review the SQL and scope with the database owner, and establish and test a suitable backup/restore plan for any existing data. Stop on uncertainty or unexpected migration history. This guide does not authorize a production change.

## 2. Configure values privately

In Vercel project settings, scope these to the designated Preview branch/environment, not Production:

| Name | Purpose and handling |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-visible staging project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-visible staging anon key; never use a service-role key. |
| `NEXT_PUBLIC_VTV_IMPORT_ENABLED` | Set `true` for the staging editorial interface. Public feature flag. |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Private staging admin credentials, entered by owner in Vercel; use values distinct from production. |
| `ADMIN_JWT_SECRET` | Private staging signing secret. Must be identical to the Edge Function secret of the same name below. |
| `ADMIN_TOKEN_EXPIRES_IN` | Optional server-only token lifetime accepted by the app; omit to use its default. |

In Supabase Edge Function Secrets, the owner sets `ADMIN_JWT_SECRET` to the same private value as Vercel and `VTV_ALLOWED_ORIGINS` to a comma-separated list of exact authorized HTTPS Preview origins (scheme, host and optional port; no paths or wildcard). Update it when the exact Preview origin changes. The function reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the function environment; these are provider-injected and the service-role key must never enter browser variables. Supabase reserves the `SUPABASE_` prefix. Verify the expected injected values exist without revealing them. See [Supabase function secrets](https://supabase.com/docs/guides/functions/secrets). Redeploy the Preview after Vercel environment changes. Do not send secret values as evidence.

## 3. Review the deployment inventory

At the reviewed repository revision, dictionary migrations in order are:

- `20261108000000_vtv_preview_limit.sql`
- `20261108000001_vtv_import_storage.sql`
- `20261108000002_vtv_editorial.sql`
- `20261108000003_vtv_rights_review.sql`
- `20261114000000_vtv_answer_collisions.sql`
- `20261114000001_vtv_publication.sql`
- `20261115000000_vtv_configuration.sql`

Recheck the checkout and remote migration history before applying anything; this list is a snapshot, not a replacement for review. `20261115000001_quiz_baseline.sql` is a separate Quiz feature, not a dictionary requirement. A blanket migration push may include it and any later migrations: inspect the complete pending list and its preconditions rather than assuming a dictionary-only operation. Resolve discrepancies with the database owner; do not reset or overwrite an existing database to make history match.

After review and authorization for this designated staging target, apply the approved dictionary migrations in order using the database owner's reviewed procedure, then verify the resulting migration history and schema before proceeding. Do not blindly push every pending migration. Deploy the matching `vtv-dictionary` Edge Function from the same reviewed revision, and the matching Vercel Preview. `supabase/config.toml` specifies `verify_jwt = false` for this function because it validates the application's custom admin token itself; preserve that configuration and verify the actual gateway behavior rather than treating the gateway as the authorization boundary. `quiz-submit` is a separate Quiz function and is not required for the dictionary-only rehearsal. Follow [Supabase deployment guidance](https://supabase.com/docs/guides/functions/deploy); verify project targeting at each step. Do not run commands against an unidentified linked project.

## 4. Return non-secret evidence

Provide the owner-designated staging project reference and URL, Vercel Preview URL/origin, branch and commit, and confirmation that both differ from production and contain no production data. Record the reviewed migration inventory/history and backup/restore decision, deployment revision, function name and gateway configuration, allowed origin, and confirmation that the private signing secrets match without sharing either value. Report any access constraints or missing prerequisites. An owner can grant the verifier least-privilege access through provider controls or operate sensitive steps themselves; coordinate credentials through an approved private channel, never chat.

Ticket 17 must still verify actual staging gateway CORS, custom-token authorization, direct anon/authenticated denial, rate limiting and deployed configuration. Ticket 13 remains blocked on its documented dependencies, real source clearance and physical input evidence. This guide does not establish those results or claim a deployment occurred. Provider access, exact Preview hostname, migration history, backup capability and hosted gateway behavior remain unverified until the owner supplies evidence.
