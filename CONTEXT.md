# 4snow Domain Language

## Vua tiếng Việt

**Dictionary candidate**:
A sourced Vietnamese word or phrase awaiting editorial review for use in the game.
_Avoid_: Valid word (before approval)

**Accepted guess**:
A word or phrase approved for submission in a round, matched by its normalized spelling.
_Avoid_: Possible answer

**Answer entry**:
An approved word or phrase eligible to be selected as a round's answer, with its original Vietnamese spelling and a reviewed Vietnamese definition.
_Avoid_: Any accepted guess

**Normalized spelling**:
A spelling normalized to Unicode NFC, with ordinary spaces removed and case ignored. Vietnamese diacritics are preserved: E, Ê, and Ế are distinct letters, as are D and Đ. Canonically equivalent Unicode spellings share a normalized spelling; words differing in accents do not.

**Dictionary release**:
A published collection of approved guesses, eligible answers, and their required source attribution.

**Round**:
One solo game with a selected letter count, a selected answer entry, and a limited number of accepted guesses.

**Withdrawn dictionary entry**:
A dictionary entry removed from both guess acceptance and answer selection in subsequent releases while retaining its editorial history and remaining eligible for restoration.

**Current win streak**:
The number of consecutive rounds won across all letter counts since the last loss or abandonment. A round that can still be resumed is ongoing.

**Longest win streak**:
The highest number of consecutive rounds the player has ever won in a streak.

**Abandoned round**:
A started, unfinished round that the player discards or replaces with a different round.

**Opening clue**:
A clue shown from the start of a round when the player enables it. It uses the answer entry's reviewed topic or short description when available and its full definition otherwise. It consumes no hint credit.

**Hint credit**:
One use of a hint. A win earns one credit for subsequent rounds. The player can carry up to three credits, and each hint consumes one credit. Unused credits carry over after a loss or abandonment.

**Revealed letter**:
An answer letter shown on the keyboard by a hint, including its Vietnamese diacritics. Revealing a letter does not fill a position in the guess.

**Locked position**:
A position in the current guess filled with its correct letter by a hint after all answer letters are known. The player can edit the remaining positions. The lock applies to that guess only.
