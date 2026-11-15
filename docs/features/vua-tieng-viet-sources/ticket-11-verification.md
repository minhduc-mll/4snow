# Ticket 11 verification — 2026-11-15

Competing tabs now pause persistence and require an explicit load-saved or keep-this-round-and-replace decision. Feature-key storage events re-read the actual current key; an exact baseline comparison also detects conflicts before delayed events arrive. Writes and resolutions run under one browser Web Lock. Operation generations invalidate queued writers, resets, and pending new-round loads. Same-round keeping advances the revision above both competing revisions without merging inputs or accepted guesses.

Both resolution choices validate the selected complete historical snapshot. Invalid or incompatible foreign history stays untouched after a failed load; the keep-and-replace action explicitly consents to replacement. Quota/access failures keep the modal and local history intact for retry. Clearing storage requires a choice too; explicitly loading the now-empty save returns to the start action. Escape/outside clicks cannot silently decide a conflict. Resolution restores typing focus or the appropriate replay/start button.

Active replacement retains the existing confirmation. Content and randomness failures/cancellation preserve the previous in-memory round and exact recoverable save. A competing save aborts/invalidate an in-flight replacement, so even a delayed response after recovery cannot replace the selected history.

## Verification

- Focused persistence adapter and multi-page browser journeys passed during implementation. Five new adapter tests cover delayed events, explicit selection, queued writers/revision order, resolution failures, unavailable locking, and safe reset.
- `npm.cmd test`: 53 Node tests + 2 Vitest tests passed (55 total).
- `npm.cmd run test:browser`: 40 passed, 2 skipped. Seven new multi-page journeys cover same/different round conflicts, both choices, equal-revision stale writers, quota/access failures and retry, delayed replacement responses, failed/cancelled replacement, corrupt/cleared saves, and focus recovery. The existing optional native IME smoke remains ticket 09's physical verification; the production offline case runs separately.
- `npx.cmd tsc --noEmit`: passed regularly during development.
- `npm.cmd run lint`: passed. The first lint found a React ref-analysis issue with passing a nested model ref directly; destructuring the action ref before JSX resolved it without suppression.
- `npm.cmd run build`: passed, using synthetic public browser-fixture settings and existing Google font downloads. No environment files, dependencies, servers, routes, or public schema versions were added/changed.
- Production offline regression: 3 consecutive passes with `npx.cmd playwright test --config playwright.offline.config.ts --repeat-each=3 --workers=1`. Each run requires one document navigation, switches the language to English and back to Vietnamese offline, finishes the restored round, and refuses offline replay. Task-owned production test servers required explicit shutdown after passing checks to release the Playwright output pipe.

The first production offline regression restored input but looped through browser navigations after failed RSC requests. A short browser/network diagnostic harness reproduced the loop; local next-i18next source showed its language change helper calls `router.refresh()`. Preference restoration now uses the client translation instance, and explicit offline language changes avoid server refreshes. The strengthened test detects the original loop even if input briefly appears usable.

Browser Web Locks require a supported browser and secure origin (HTTPS or localhost). If locking is unavailable or denied, play remains in memory with the existing persistent recovery warning; the adapter does not perform an unlocked write. Uncooperative scripts/extensions manually changing localStorage do not share this lock, but baseline comparisons/storage events detect their changed saves. No distributed database or tamper-proof guarantee is claimed.

## Standards

Independent review: **0 findings**. Changes preserve hook/component boundaries, memoize the storage subscription, validate selected snapshots, and contain storage/locking failures. Web Locks plus baseline and generation checks prevent stale writes without new servers or state-management violations. No actionable baseline smells.

## Spec

Independent review: **0 findings**. Storage events and locked pre-write checks detect conflicts; queued writes and pending replacements are invalidated. Explicit full-snapshot choices do not merge histories. Browser tests cover both conflict forms, delayed events, retry, failed/cancelled replacement, corrupt/cleared saves and focus. No actionable scope creep or incorrect behavior.

Totals: Standards 0 findings (no worst issue); Spec 0 findings (no worst issue).
