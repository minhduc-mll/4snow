# Ticket 05 local acceptance (2026-11-14)

The developer explicitly authorized completing ticket 05's local verification before ticket 07, keeping hosted checks and real-source rights clearance as release requirements.

- Focused rights Node tests: 3 passed.
- All current migrations plus `tests/supabase/rights-review.sql` in a disposable local PostgreSQL database: passed; database removed afterward.
- `npm run test:vtv:local:browser -- --grep 'real source rights workflow'`: real local UI/Edge/PostgREST/database journey passed. Synthetic import, explicit clearance, committed-response loss/retry with the identical receipt/key, linked rejection, exact attribution field allowlist and logout cleanup verified. Initial test failures were incorrect translated labels and an asynchronous assertion; corrected before the passing run. No application behavior changed.
- `node tests/vua-tieng-viet/rights-local.integration.mjs`: real anon and Auth-issued authenticated user denied rights/detail RPC access and private schema access; temporary Auth user deleted.
- The broader pre-existing local HTTP suite currently stops at CORS preflight: expected 204, received 200 from the local gateway. The real browser workflow works; the harness/gateway expectation discrepancy remains explicitly open. No gateway configuration was changed. This does not constitute a passing full HTTP suite or hosted acceptance.

Local prerequisite accepted under the developer's scope. Only synthetic source decisions were written; no real source was cleared and no release was published.
