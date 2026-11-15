# Ticket 11 — competing round recovery

Ticket 10 is resolved. Use the already approved pure persistence adapter and multi-page browser journey seams with TDD. Preserve the versioned historical snapshot and existing replacement confirmation.

Types: persistence outcomes are saved, conflict, superseded, or unavailable. Conflict resolution returns a validated restored/kept round or an explanatory failure. The storage adapter owns its last observed serialized save, pause flag, and operation generation; the hook owns the visible conflict dialog and local playable round.

Pseudo-code:

1. Record the exact save observed at hydration. On feature-key storage events (including clear), re-read the actual key. A changed value pauses writes and invalidates queued operations; unrelated or delayed events matching the baseline do nothing.
2. Serialize read/check/write under the browser Web Locks API using one feature lock. Compare the current save to the observed baseline immediately before writing; detect changes even before their storage event arrives. Superseded operations never write. If locking/storage is unavailable, keep memory state and warn instead of risking an unlocked overwrite.
3. Offer a modal with explicit load-saved and keep-this-round/rewrite-save actions. Both run under the same lock, re-read the latest save, and validate the selected complete snapshot. Loading never merges inputs; keeping advances the revision above competing revisions for the same round. Failed access/quota/validation leaves the dialog and local round intact. Invalid foreign saves are replaced only through the explicitly labelled keep-and-replace action.
4. Pause gameplay/replacement while resolving. A competing save aborts/invalidate pending release loads. Prepare a valid release and answer, then check persistence before replacing memory; cancellation, failed fetch/randomness, and stale async work retain the prior round/save. Restore usable typing/action focus after resolution.
5. Test equal-ID/revision divergence, different rounds, delayed events and queued writers, both explicit choices, invalid/missing saves, storage failures, replacement failure/cancellation, and focus. Run typecheck/focused tests regularly, full suites, lint/build, independent standards/spec reviews, and commit task-only changes.

2026-11-15 verification follow-up: the production offline regression exposed repeated RSC refreshes from automatic language preference synchronization. Sync the preference through the client translation instance; explicit language changes while offline also stay on the client. Strengthen the production browser test to require one document navigation and exercise both offline language choices before finishing the recovered round. This preserves ticket 10 recovery behavior while changing persistence.
