# Ticket 15: repeated-letter help

Plan: add one translated explanatory paragraph to the existing help dialog, without changing game evaluation or dialog behavior. For answer `AABBC` and guess `BABAA`, reserve exact positions 2 and 3, then allocate remaining letters left to right, yielding `present, correct, correct, present, absent`. The sequences illustrate the algorithm and are not asserted to be dictionary entries.

Types: reuse the existing translation strings and `LetterFeedback` states; no new runtime types or state are needed. The paragraph spells out symbols and accent sensitivity, and the browser check opens and closes the existing dialog.

Verification on 2026-11-15: `npx tsc --noEmit`, `npm run lint`, and `npm run build` passed. The focused Playwright help test reported passing; its development server used fallback fonts because Google Fonts requests failed. Skill-directory scripts are excluded from the application lint gate. This check does not establish physical-device behavior.
