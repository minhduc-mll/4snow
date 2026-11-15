# Vua tiếng Việt Feature Requirements

Status: Product decisions confirmed. This document specifies future implementation; the current work is documentation only.

Implementation handoff: [implementation-ready specification](./vua-tieng-viet-spec.md), including source prerequisites, storage/API contracts, local snapshots, and testing.

Read `AGENTS.md`, `shared.md`, and this document for gameplay work. Read [the dictionary requirements](./vua-tieng-viet-dictionary.md) for dictionary, admin, publication, or authorization work. Domain vocabulary is defined in [CONTEXT.md](../../CONTEXT.md).

## 1. Scope and confirmed decisions

Add a casual, solo Vietnamese word-guessing game named **Vua tiếng Việt**, based on the supplied Vietnamese Word Guess specification v1.1.

- Four levels: 3, 5, 7, and 9 normalized letters. Each accented Vietnamese letter occupies one cell; ordinary spaces do not occupy cells. For example, “tiếng Việt” occupies nine cells.
- Six accepted guesses per round by default; attempt limit is admin configurable.
- Guesses must match an approved dictionary entry. Validation is mandatory.
- Browser-side answer selection and evaluation are acceptable for this casual scope. Downloaded answers can be inspected; this is not a trusted competition.
- Dictionary candidates, editorial metadata, and administration data remain private in Supabase.
- Players may download only approved, published gameplay content and required attribution.
- Keep the existing admin login. Trusted dictionary operations use Supabase Edge Functions that independently verify its JWT.
- No player accounts, rooms, multiplayer, timers, rankings, daily challenges, hints, social sharing, or realtime gameplay are required.

## 2. Routes and existing integration

Player route: `/vua-tieng-viet`, implemented within the existing player route group. Add its route constant to `lib/paths.ts` and navigation from the existing home page.

Add a Vua tiếng Việt section within the existing `/admin`; reuse its authenticated shell and logout behavior. Dictionary controls are specified in the companion document.

Follow the current root-level structure: route components under `app/`, feature hooks under `hooks/`, domain types under `types/`, and feature UI under the existing atoms/molecules/organisms layers. Reuse atom wrappers and generic components; keep Quiz and Lucky Draw models and stores separate.

Use existing TanStack Query providers for published dictionary/configuration requests and invalidation after authorized mutations. Keep gameplay transitions in a feature hook with local React state; Zustand, if needed, holds UI interactions only. Do not copy remote dictionary data into a Zustand store.

Follow the existing localization mechanism. The game title, Vietnamese answer spelling, and Vietnamese definitions retain their original language.

## 3. Domain types and boundaries

```ts
type WordLevel = 3 | 5 | 7 | 9;
type RoundStatus = "playing" | "won" | "lost";
type LetterFeedback = "correct" | "present" | "absent";

type WordAnswer = {
  id: string;
  original: string;
  normalized: string;
  level: WordLevel;
  definitionVi: string;
  attributionIds: string[];
};

type WordGuess = {
  id: string;
  input: string;
  normalized: string;
  feedback: LetterFeedback[];
  submittedAt: string;
};

type WordRound = {
  id: string;
  releaseId: string;
  configVersion: string;
  level: WordLevel;
  answerId: string;
  attemptLimit: number;
  input: string;
  guesses: WordGuess[];
  status: RoundStatus;
  startedAt: string;
  updatedAt: string;
  endedAt: string | null;
};
```

These are planning contracts, not existing exported APIs. Runtime-validate downloaded data and restored state. Derive keyboard knowledge and round outcome from accepted guesses instead of treating saved feedback or status as trustworthy.

## 4. Input and submission

Normalize Vietnamese composed/decomposed accents to Unicode NFC, remove ordinary spaces, and compare without case sensitivity. Preserve all Vietnamese letter and tone marks: E, Ê, and Ế differ, and Đ is distinct from D. Count normalized letters rather than decomposed code units. Preserve original spellings for display and source attribution. Normalization must produce only supported Vietnamese Latin letters; punctuation, digits, and emoji must not become playable letters.

Physical keyboard, on-screen keyboard, and paste share the same input and submission pipeline. Respect IME composition; defer validation and submission until composition finishes. Gameplay shortcuts must ignore unrelated inputs, dialogs, and modifier shortcuts.

Present input as individual cells, backed by one shared text input compatible with the device's installed keyboard layout and input method. Fill from the first cell and advance automatically; Backspace removes the most recently entered letter and moves back. An accepted row is immutable. During composition, retain the IME draft without prematurely advancing committed cells or blocking accent completion. Enter used to complete composition must not submit the row.

The on-screen keyboard uses a conventional unaccented QWERTY layout. Each key with Vietnamese variants has a separate visible, accessible expansion control: pressing the main key enters its ordinary letter, while pressing the expansion control opens a small anchored dialog. Include every valid Vietnamese variant of the base letter, including vowel-shape and tone combinations, and d/đ. For E, include e, è, é, ẻ, ẽ, ẹ, ê, ề, ế, ể, ễ, ệ. Selecting a variant appends it to the next cell and closes the dialog. This does not replace or emulate the device's configured input method. Escape/outside dismissal does not change input; preserve input focus and make the dialog fully keyboard accessible.

Disable **Gửi đáp án** while the committed input is incomplete or composing. Enter also cannot submit an incomplete/composing guess. A complete guess absent from the accent-sensitive published guess dictionary produces a clear, non-destructive message. Preserve editable input, consume no attempt, and reveal no feedback. No correctness feedback is available during typing.

Submission pseudocode:

```text
if round is finished or submission is already processing: return
normalize and validate input
if length differs from level: return validation error
if normalized form is not an approved guess: return dictionary error
evaluate exact positions first, then remaining occurrences
append one accepted guess with input, feedback, and timestamp
if all letters match: mark won
else if accepted guesses reach attempt limit: mark lost
else: clear input for the next attempt
persist the resulting round safely
```

Process rapid Enter/click events once, including when multiple input handlers fire for the same submission.

## 5. Feedback and keyboard

- Green: correct position.
- Yellow: present in a different position.
- Gray: absent or excess occurrence.
- Gray disabled keyboard key: letter proven completely absent.

Allocate green matches before yellow matches, using only the remaining answer occurrences. Never award more green/yellow occurrences than exist in the answer.

Keyboard knowledge uses correct > present > absent > unknown per exact accented letter. A gray excess occurrence must not disable a letter with a green/yellow occurrence. Truly absent letters are blocked in physical input and disabled on the virtual keyboard. Paste follows the same restriction. An absent E does not disable Ê, Ế, or their other variants; expansion controls remain available when they offer usable variants. Do not apply absent-letter restrictions to an unfinished IME draft. Backspace remains available and Enter follows normal validation.

## 6. Round flow and presentation

Use a modern gameshow visual direction for mixed ages: deep purple background, darker purple surfaces, bright readable text, and lavender accents for primary actions. Reserve green/yellow/gray for feedback. Reuse existing font/component conventions with verified Vietnamese glyph support and minimal motion. No MC or shared-screen dependency.

Order the screen as title and help action, length selection, guess board, stable message area, submit action, and on-screen keyboard. The board is the visual focus. It has one visible row per configured attempt and one cell per normalized letter. Preserve accepted rows; future rows remain empty. Prioritize the board and input on phones; keep the layout stable as messages appear.

Always show a brief instruction and three-state legend. **Cách chơi** opens detailed examples only on request; never open help automatically on entry. Explain accented-letter comparison, duplicate-letter allocation, the variant picker, validation, and disabled keys.

Winning ends input and shows Vietnamese congratulations, the selected answer's original spelling, its specific reviewed definition, attempts used, and replay immediately below the preserved board. Only full accent-sensitive normalized equality wins; a differently accented spelling does not win. When source records share the exact normalized spelling, reveal the selected answer entry and its definition, never an arbitrary alternate meaning.

Losing ends input and reveals the original answer with replay below the preserved board. Showing its definition on loss is optional. **Chơi lại** selects a new answer entry at the same length using the latest validated published release. Request confirmation before discarding an active round when changing levels or restarting. Failed new-round loading must retain the current board and save.

Provide focus indicators, accessible labels, feedback beyond color, a readable nine-letter board on narrow screens, stable validation-message space, and reduced-motion behavior. Explain normalization, dictionary validation, all colors, and disabled keys in help.

## 7. Persistence and failure recovery

Supabase owns published content and configuration. Persist solo rounds in versioned browser localStorage, with no player progress uploaded, as the feature-specific exception in `shared.md`.

Pin each round to the dictionary release and configuration selected when it starts. Persist a validated public snapshot sufficient to resume independently of subsequent publication: the selected answer with its definition and attribution, the level's accepted-guess membership, release/configuration versions, and attempt limit. Keep this snapshot in the feature's local persistence layer, separate from the live TanStack Query cache; it is historical round input, not a second source of current server state.

New rounds use the latest successfully loaded published release. Publishing content or changing settings must not change an active round. Restoring a valid saved snapshot continues under its original rules even if a newer release exists. If the snapshot is missing, incompatible, or invalid, explain the problem and offer a fresh round; never silently substitute the latest dictionary or answer. Offline play may resume a valid saved round, but starting a new round requires loading the current published release.

Wrap parsing, random selection, storage, and remote calls in error handling. Retain playable in-memory state when browser persistence fails and explain that refresh recovery is unavailable.

Validate restored schema, answer reference, release/configuration versions, level, attempt bounds, normalized guesses, and state transitions. Recompute evaluation from the selected answer. Recover from corrupt or incompatible saves with an explanatory reset action.

Persist round timestamps, submitted inputs, evaluated outputs, and the relevant configuration snapshot. Avoid answer-bearing logs and analytics. This casual save is not a trusted audit record.

An empty level, missing definition, malformed release, or failed content load must show a recoverable setup error. Do not select an invalid answer or fabricate a definition.

## 8. Acceptance and implementation preparation

Automated coverage must verify accent-preserving normalization (including distinct D/Đ and E/Ê/Ế, equivalent decomposed accents, and nine-cell “tiếng Việt”), phrases, exact normalized collisions, repeated letters, rejected guesses consuming no attempts, no early feedback, accent-specific keyboard precedence, IME/paste parity, double submission, attempt bounds, win/loss, and save validation. Cover publication/configuration changes during a round, offline resume, and missing or incompatible snapshots. Incomplete or composing input disables submission; invalid dictionary input retains the row.

UI checks must cover nine-letter mobile layout, the purple palette and text contrast, all variant-key groups, keyboard navigation, picker dismissal/focus, non-color green/yellow/gray feedback, reduced motion, inline results with preserved rows, replay, and level-switch confirmation. Verify integration leaves other games independent.

The repository currently has lint/build scripts and no declared test script. Select a suitable automated test setup during implementation planning; do not claim test coverage before it exists. Implementation completion requires relevant automated tests plus repository lint and build passing.

## 9. Implementation handoff

Product decisions for this scope are settled. Before implementation, specify the local save schema and migration behavior, configuration validation bounds, concrete API/database contracts from the dictionary document, and the automated test setup. These are implementation tasks, not additional product features.

Dictionary preparation uses offline versioned JSON and admin review; editorial eligibility and release publication are owned by the companion dictionary document.
