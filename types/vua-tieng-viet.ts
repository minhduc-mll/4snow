export type WordLevel = 3 | 5 | 7 | 9;
export type GuessMode = "dictionary" | "free";
export type AccentAccuracy = "strict" | "optional";
export type WordDifficulty = "easy" | "hard" | "expert";
export type AnswerCategory = "common" | "regional" | "technical" | "less-common" | "rare";
export type RoundRules = { guessMode: GuessMode; accuracy?: AccentAccuracy; difficulty?: WordDifficulty };
export type RoundSettings = { level: WordLevel; guessMode: GuessMode; accuracy: AccentAccuracy; difficulty: WordDifficulty };
export type GuessEligibility =
  | { canSubmit: true; normalized: string }
  | { canSubmit: false; reason: "incomplete" | "composing" | "invalid" | "not-in-dictionary" | "unavailable" };
export type LetterFeedback = "correct" | "present" | "absent";
export type RoundStatus = "playing" | "won" | "lost";
export type WordAnswer = { id: string; original: string; normalized: string; level: WordLevel; definitionVi: string; attributionIds: string[]; category?: AnswerCategory };
export type PublicAttribution = { id: string; sourceName: string; sourceEntryId: string; sourceSenseId: string | null; entryUrl: string; artifactUrl: string; artifactSha256: string; resourceRevision: string; artifactRevision: string; licenseName: string; licenseVersion: string | null; licenseUrl: string; attributionText: string; historyUrl: string | null; modificationsNotice: string };
export type ReleaseLevel = { guesses: string[]; answers: WordAnswer[] };
export type ReleasePayload = { schemaVersion: 1; normalizerVersion: "vi-nfc-v2"; releaseId: string; configurationId: string; attemptLimit: number; initialAbsentCount?: number; levels: Record<WordLevel, ReleaseLevel>; attributions: PublicAttribution[] };
export type PublishedRelease = { payload: ReleasePayload; payloadHash: string; publishedAt: string };
export type CurrentRelease = { releaseId: string; pointerRevision: string };
export type WordGuess = { id: string; input: string; normalized: string; feedback: LetterFeedback[]; submittedAt: string };
export type WordRound = { id: string; releaseId: string; configVersion: string; level: WordLevel; rules: RoundRules; answerId: string; attemptLimit: number; initialAbsentLetters?: string[]; input: string; guesses: WordGuess[]; status: RoundStatus; revision: number; startedAt: string; updatedAt: string; endedAt: string | null };
export type PlayableRound = { round: WordRound; answer: WordAnswer; membership: string[]; attributions: PublicAttribution[]; singleAnswerReplay: boolean };
