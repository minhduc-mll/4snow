# Secure import preview implementation plan

1. Shared domain seam: `PreviewResult` has validity, counts, canonical hash, indexed errors, and truncation; parse bounded UTF-8 with duplicate-key detection, then validate the v1 document and compute exact-accent collision counts. Browser and Edge must call the same implementation.
2. Trusted seam: closed `import-preview` envelope; reject oversized streamed bodies, disallowed origins and invalid custom HS256 JWTs before any privileged rate-limit call. Use an atomic database-backed fixed window and safe responses. No candidate writes.
3. UI seam: a typed hook reads a bounded JSON file, shows advisory validation, calls the authenticated Edge function, handles 401 by clearing private state, and exposes bounded errors. Integrate with existing admin shell, atoms, localization and Query provider.
4. Verify through focused pure fixtures, direct HTTP authorization/rate-limit tests, and admin browser journeys. Run strict typecheck, lint and build; record environmental blockers and results.

## Verification and deployment prerequisites

- 2026-11-14 local Supabase recheck: the CLI started a local stack and applied all four dictionary migrations. `tests/supabase/preview-limit.sql`, `import.sql`, `editorial.sql`, and `rights-review.sql` passed against its PostgreSQL. The locally served Edge Function returned 401 for missing and invalid admin tokens and 200 for a valid admin list request through the local gateway. This does not establish hosted gateway configuration, real hosted-role behavior, or cross-instance limits.

- 2026-11-12 recheck: `npm.cmd test`, `npm.cmd run test:deno`, and `npx.cmd tsc --noEmit` passed. All six Playwright cases reported passing; the runner did not exit and was interrupted. Repository lint again reported 15 errors and one warning in `.agents/skills`. The build could not fetch the existing Geist fonts from Google Fonts in the restricted environment. These checks do not replace the non-production gateway and role tests below.

- `npm test`: Node contract/preview tests and Vitest pure fixtures pass.
- `npm run test:deno`: Deno normalization/canonical-hash parity and direct HTTP authorization tests pass.
- `npm run test:browser`: Playwright synthetic preview, normalization collision, logout and 401 cleanup journeys pass (the Edge response is mocked).
- Disposable PostgreSQL 16: applied `20261108000000_vtv_preview_limit.sql` with Supabase-like roles; `tests/supabase/preview-limit.sql` passed, including denied browser-role privileges and the 31st-call limit. This is not a Supabase gateway or PostgREST integration test.
- Strict TypeScript and production build pass. Repository-wide lint has 15 pre-existing errors and one warning in unrelated `.agents/skills` scripts; focused lint passes.
- Non-production Supabase gateway, Edge deployment, matching `ADMIN_JWT_SECRET`, `VTV_ALLOWED_ORIGINS`, and service-role configuration have not been tested. Do not enable this preview in production until direct gateway, RLS/grants and concurrent rate-limit behavior are verified against that environment. The custom-token gateway configuration and independently verified role are both required; the custom token must never be used as a Supabase Auth session.
- Duplicate/conflict counts currently describe identities inside the uploaded chunk. Cross-import identity checks require the private candidate storage introduced in ticket 03 and are not represented by this preview.
- npm audit reports existing project dependency advisories; adding the patched compatible Vitest release avoids introducing its known critical advisory. No production dependency was intentionally upgraded.
