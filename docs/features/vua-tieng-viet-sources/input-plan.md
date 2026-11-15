# Ticket 09: Vietnamese input and accessibility

Prerequisite: ticket 08 is locally verified under the accepted development scope. Preserve unrelated working-tree changes. Initial review point: `931d1ece586826b58ae71eed0fc6c1534c609f67`; commit only this ticket.

Types: `VariantBase = A | E | I | O | U | Y | D`; a read-only map of all NFC Vietnamese shape/tone variants. A picker hook owns only open/selection/focus interaction state. Existing `PlayableRound`, `WordGuess`, exact-letter feedback and synchronous round revision remain the domain boundary; no persistence or server changes.

Pseudocode:
1. Keep one shared field and `commitInput`/`submitGuess` transitions. Defer IME drafts; guard the actual confirming Enter sequence, repeated Enter and incomplete/composing submission. Native typing, paste, ordinary virtual keys and selected variants use the same validated input path. Keep sequential caret/tail corrections without changing an unfinished IME draft or intercepting modifier shortcuts.
2. Wrap the installed Radix/shadcn-style Popover in the existing ui/atom layers. Each variant key has a separate ordinary-letter button and a visible labelled expansion button. Use modal anchored content with collision handling, focus containment, Escape/outside dismissal and explicit selection-versus-cancellation focus restoration. Only exact absent letters are disabled; expansion stays usable if any variant remains available.
3. Provide all 74 base/shape/tone combinations across the seven groups, including D/Đ. Selection appends one NFC letter and closes. Imported text stays escaped. Add localized names, help, reduced-motion handling and narrow-screen styles without changing other games.
4. Verify browser input parity, atomic invalid/disabled pastes, composing Enter, event bursts, exact-letter precedence, all picker contents, keyboard selection/dismissal/focus, dialog/shortcut isolation, mobile 320/375px and reduced viewport layout, and non-color clues. Inspect screenshots and measure semantic palette contrast.
5. Check available Windows input methods and attempt actual installed Vietnamese IME smoke testing with native UI where available; record real-device evidence separately from synthetic browser composition. Do not install/change system language preferences or claim a mobile software keyboard was exercised by viewport emulation.

Approved seams from the spec: browser user journeys and focused pure normalization/evaluation/input transitions. Use red/green slices and regular typechecks, then full tests, lint/build, independent Standards/Spec review and commit.

## Automated verification (2026-11-14)

- `npm test`: 42 Node tests and 2 Vitest tests passed. Added exact-letter precedence across accepted guesses: correct > present > absent independently for E/Ê/Ế and D/Đ.
- `npm run test:browser`: final run **27 passed, 1 skipped**. The skipped case is the opt-in native Windows IME smoke test, not an automated success. All pre-existing gameplay/admin/publication journeys pass.
- New browser coverage verifies all seven complete variant lists (74 letters), separate ordinary/expansion actions, NFC append and focus restoration, modal keyboard containment, Escape/outside cancellation, absent-base/available-accent interaction, atomic invalid/disabled paste rejection, sequential corrections, duplicate Enter/click, composing drafts and confirming Enter, modifier/help isolation, 320px/375px layouts, short viewport collision handling, reduced motion and hovered feedback contrast.
- Focused hovered-feedback contrast passed five repeated runs. The final regression fix removes CSS background/color transitions from ordinary and variant keys, preventing transient low contrast immediately after feedback. Intentional full-input replacement after rejection is preserved by avoiding caret forcing during focus; sequential tail behavior remains in click, typing and paste handlers.
- `npx tsc --noEmit`, `npm run lint`, `npm run build`: passed (including reviewed fixes). Build uses the existing Google font configuration and network access.
- Inspected generated `output/playwright/picker-320.png` and `input-375.png`. The modal stays anchored and within the short viewport; its variants scroll when needed. The nine-letter board/keyboard do not overflow horizontally. Native mobile software keyboard behavior is not established by these screenshots or viewport emulation.

## Standards review

Independent Standards review found no hard documented violations, material baseline smells, secrets, unsafe types, or cross-game state coupling. Reviewer also verified the replacement-input and hover corrections. **0 remaining Standards findings.**

## Spec review

Independent Spec review identified low contrast when hover replaced a present key's gold background while retaining dark text. Removed the override, then removed feedback color transitions after the full run exposed an intermediate low-contrast frame. Added computed-style hover contrast checks; repeated focused tests and final full suite pass. Reviewer confirmed **0 remaining implementation findings**. **1 verification item remains open**: physical Windows IME and mobile software-keyboard checks.

## Native/device verification blocker

UniKeyNT was running. Inspected its actual native panel: UniKey 4.6 RC2, Unicode encoding, Telex input method. No settings or input modes were changed. A duplicate-instance notice and the inspected panel were closed.

Attempted the opt-in headed journey with synthetic dictionary responses in a dedicated browser, first Chrome for Testing and then installed Chrome. Windows automation could read accessibility text but could not establish usable native input: Chrome-for-Testing binding failed with `window id ... no longer belongs to Chrome; current owner is Chrome`; installed-Chrome click failed with `coordinate input geometry is unavailable`; screenshot capture failed with `window capture timed out: timed out waiting on channel`. Native keyboard focus remained in the address bar. The pending test browsers/processes were closed. No actual Vietnamese typing or successful native smoke assertion was observed. This is a tool/environment limitation, not evidence that the application works with UniKey.

Real Windows IME and an actual mobile software keyboard therefore remain **unverified**. Their acceptance checkbox remains unchecked and ticket 09 is not marked resolved. Synthetic composition and reduced-height viewports are recorded only as automated evidence.

To finish the Windows check with human input, run in PowerShell:

```powershell
$env:VTV_NATIVE_IME_SMOKE='true'
npm.cmd run test:browser -- --headed --workers=1 --grep 'native Windows Vietnamese'
Remove-Item Env:VTV_NATIVE_IME_SMOKE
```

The opt-in journey opens a nine-letter round using synthetic data. Click the current board row, use the installed Unicode/Telex keyboard to enter `tiếng Việt` (for example `tieengs Vieetj`), verify no attempts/feedback occur before submission, then submit. The harness waits for the actual field value and victory; it does not generate text/composition events itself. On a physical phone, additionally exercise IME/paste and all picker groups with the software keyboard open, dismissal/focus and scrolling at 320/375 CSS px where available.

No real dictionary was published, no new server/Edge/schema/dependency was introduced, and unrelated working-tree work is preserved. Persistence remains ticket 10's scope.
