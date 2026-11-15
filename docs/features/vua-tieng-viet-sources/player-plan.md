# Ticket 08: published solo round

Prerequisite: ticket 07 is locally verified under the accepted development scope. Hosted release readiness remains separate. Preserve unrelated working-tree changes; review against initial HEAD `7673dc3c87b98100646bb6c32521ecce554f681c` before committing.

Types: `WordLevel = 3 | 5 | 7 | 9`; strict public `ReleasePayload`/`PublicAttribution`/`WordAnswer`; `WordRound` stores UUIDs, pinned release/configuration/attempt limit, raw input, accepted guesses with evaluated feedback and timestamps, status and local revision. `PlayableRound` holds the selected immutable public answer, level membership and referenced attribution as historical in-memory input. No Zustand or persistence in this ticket (ticket 10 owns saves).

Pseudocode:
1. Fetch current pointer and referenced immutable release with TanStack Query/browser-only PostgREST SELECT and anon key. Bound streamed responses, strictly validate exact public fields, levels, counts, sorted unique spelling/answers, membership, attribution/HTTPS links, identifiers, metadata and canonical SHA-256 before caching. Recheck pointer; retry boundedly if changed. Every new round/replay requires online network validation, even with cached data.
2. Select an answer using crypto uint32 rejection sampling. Replay excludes the previous answer ID if alternatives exist, otherwise explain the single-answer fallback. Construct a replacement round completely before replacing current state; failures retain the existing round.
3. A feature hook serializes committed input and submission with synchronous refs/revision. Shared normalizer preserves accents. IME draft stays separate until composition end; composition-confirming Enter cannot submit. Invalid input/length/membership preserves input without feedback/attempt. Accept exact-first repeated-letter feedback; derive strongest exact-letter keyboard evidence; terminal rounds lock. UUID/time/random failures are handled.
4. Add player route/home card and a feature-scoped purple token palette. Compose existing atom wrappers into board/input/keyboard/help/confirmation/results molecules. Keep all configured rows, stable messages, short instructions/legend, manual help and inline answer/meaning/attribution results. Confirm before replacing an active round; replay uses the same level and latest validated release. No global gameplay key handlers.
5. Ticket 09 owns Vietnamese variant pickers and comprehensive device interaction; retain installed IME/paste and ordinary virtual QWERTY here. Ticket 10 owns storage/offline resume; ticket 11 owns cross-tab conflicts. No server/Edge/schema work is needed for gameplay.

Approved seams: pure validators/normalization/evaluation/selection and browser player journeys. Use red/green slices, focused tests/typechecks during implementation, full suite once at the end plus lint/build, separate Standards/Spec review, then commit only task files.

## Verification (2026-11-14)

- `npm test`: 41 Node tests and 2 Vitest tests passed. Player tests cover all levels, 1/6/12 attempts and invalid bounds, rejection preservation, exact-first duplicate-letter feedback, accent-specific knowledge and canonical matching, loss/win/terminal/stale transitions, unbiased selection/replay and handled randomness, strict schema/hash/attribution and bounded/duplicate JSON, empty levels and changing pointers.
- `npm run test:browser`: final full run passed all 18 journeys, including all existing dictionary/admin journeys. Player journeys cover home navigation, every level and configured row count, incomplete/rejected input without feedback/attempts, IME confirming and non-Enter completion, pinned old content/configuration and latest-release replay, exact selected meaning/credit, different-answer replay, duplicate Enter, inline win/loss, missing/malformed release recovery, offline replay refusal, confirmation cancellation/focus, failed replacement/load/randomness preservation and other-route independence. Browser PostgREST responses use synthetic fixtures; this is not hosted HTTP evidence.
- `node tests/vua-tieng-viet/publication-sql.integration.mjs`: passed in a fresh disposable local database with current migrations. Added actual published release/pointer reads under the anon role through the browser validator, proving SQL publication/hash/public schema compatibility. Database removed afterward; application data/migrations were not changed.
- `npx tsc --noEmit`, `npm run lint` and `npm run build`: passed, including after review fixes. Build fetched the existing Google fonts with network access.
- Inspected the 320px nine-letter full-page screenshot at `output/playwright/player-320.png`; browser asserts no horizontal overflow. The language widget initially obscured keyboard controls, so its existing UI was extracted into a shared molecule and rendered inline only on this route. Other routes keep the floating layout. Semantic feedback uses both symbols and text; semantic colors remain feature-scoped. Vietnamese glyphs rendered correctly. Real installed-IME/device/picker checks remain ticket 09 work.

## Standards review

No hard documented-standard violations or material baseline smells found. One input correctness concern: unconditional suppression after composition end swallowed a deliberate Enter following mouse/candidate completion. Tied suppression to the actual composing Enter key sequence and added a non-Enter completion regression. Reviewer verified 0 remaining hard violations or correctness findings.

## Spec review

One finding identified the same intentional-Enter issue against ticket 08's Enter rules. Updated the confirming-key test sequence and added the separate non-Enter completion journey. Both focused tests and the final full browser run passed. Reviewer verified 0 remaining findings. No loader, selection, pinning, evaluation, replay or feature-boundary defect was demonstrated.

Review totals: Standards 0 remaining hard/correctness findings; Spec 0 remaining findings. Reviews used the staged task-only diff against the initial commit, followed by verification of the working-tree fixes.

## Scope and remaining release work

The player is locally verified with synthetic published content. It uses only browser-safe PostgREST SELECT, never custom-admin credentials, private tables, new Next.js handlers or Edge operations. Public Query caches are validated before use; the active in-memory round stays pinned. Pointer/release requests are forced online on every start/replay, with bounded retries and no cached-data fallback. Streamed wire data is capped at 3 MiB to allow PostgREST JSONB whitespace/row metadata; the canonical public payload retains its strict 2 MiB cap and per-level limits.

No real dictionary was published and no hosted deployment/readiness was verified. Ticket 09 owns all variant pickers and comprehensive device/accessibility checks; ticket 10 owns persistence/offline resume; ticket 11 owns cross-tab recovery. This version explicitly explains that refreshing starts over. The existing hosted/CORS release gates are unchanged.
