# Ticket 10 — historical round persistence

Use the specification's approved pure persistence and browser journey seams. Ticket 08 is locally verified; ticket 09's native IME checks do not block this ticket. Cross-tab conflict choices belong to ticket 11.

Types: `RoundSave` has schemaVersion 1, normalizerVersion vi-nfc-v2, savedAt, revision, snapshot, and round. Snapshot contains release/configuration IDs, level, attempt limit, the selected public answer, complete chosen-level membership, and exactly its referenced public attributions. Recovery is empty, restored, invalid, incompatible, or storage unavailable.

Pseudo-code:

1. Read only `vtv:round:v1`, catching access failures. Bound UTF-8 bytes at 3 MiB before strict JSON parsing. Validate exact envelope fields, version, bounds, identifiers, public answer/attributions, and normalized distinct membership.
2. Validate each accepted input sequentially against historical membership and prior disabled letters. Reject duplicate IDs, invalid times/references, and post-terminal guesses. Recompute feedback/status; validate terminal timestamps against the recomputed history. Validate the editable input using the same transition function.
3. Hydrate once on mount without network requests. Preserve invalid/incompatible bytes and block replacement until an explicit reset; remove only the feature key. Storage failures allow in-memory play with a persistent warning.
4. Persist synchronously from the committed transition boundary, using the current ref rather than a render effect. Write one validated envelope atomically. IME drafts and rejected transitions are never saved. A failed new-round load leaves the old round/save intact.
5. Exercise round trips, malformed/oversize/version failures, derived hints, sequential history, storage failures, offline restoration/new-round refusal, and publication changes. Run typecheck, focused tests, full tests, lint/build, then independent standards/spec review and commit task files only.

Review follow-up: literal offline refresh also needs the application shell. Add a browser service worker scoped to `/vua-tieng-viet`, caching only that public document, same-origin Next static assets, and locale JSON. Never cache dictionary/API/admin requests. Prepare currently loaded assets before reporting offline readiness; use network-first document refresh and immutable asset fallback. Failed preparation leaves gameplay available with an explicit offline-readiness warning. Verify real browser offline reload separately from dictionary-only outage tests.

The denied-storage browser check exposed pre-existing uncaught language preference reads above the player. Share a guarded read with a Vietnamese fallback so the player can mount and warn when the localStorage getter itself is denied. Language writes keep their existing explicit error behavior.
