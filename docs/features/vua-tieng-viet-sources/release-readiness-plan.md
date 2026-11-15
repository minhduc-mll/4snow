# Ticket 13 prerequisite and release-readiness audit

The issue-tracker rule prevents starting the real-data rehearsal before its blockers are resolved. Ticket 01 still lacks independent source pinning and qualified rights review; ticket 09 still lacks physical Vietnamese IME/mobile verification. This pass gathers independent readiness evidence and prepares a concrete gate ledger; it does not approve data, claim a rehearsal, or publish a release.

Evidence types: gate (`source`, `rights`, `editorial`, `native-input`, `deployment`, `security`, `publication`, `player`, `tooling`), disposition (`verified-locally`, `unverified`, `blocked`), command/result, scope (pure, mocked browser, disposable SQL, actual local HTTP, or designated non-production deployment), and non-secret audit/receipt/build/release references. Synthetic IDs are never evidence for real-data acceptance.

Pseudo-code:

1. Read prerequisite tickets, retained source/rights ledger, prior verification and local deployment metadata without printing secrets. Identify any reviewer sign-off, physical test evidence, and an explicitly designated non-production target; request missing evidence while continuing independent checks.
2. Recheck current pure/Edge-handler, browser, Deno, typecheck, lint and build gates. Run existing disposable SQL publication/configuration tests and available direct local HTTP checks. Record failures and scope precisely; do not turn mocked tests or a local container into deployed/cross-instance acceptance.
3. Verify retained artifact bytes and generated chunk validation using the existing contract suite. Preserve Underthesea's documented omission. Do not infer extraction lineage, legal clearance, editorial approval, definitions, or human/device outcomes.
4. Record passed gates separately from blockers, with commands and references. Keep real-data import/review/publication and deployment-dependent checks pending until gate evidence exists. Do not mutate real dictionary/content data, apply hosted migrations, deploy to an unidentified project, or publish production.
5. Review the evidence changes on standards/spec axes, preserve unrelated work, and commit the gate report. Leave ticket 13 blocked rather than marking the real-data release accepted.
