import type { AccentAccuracy, GuessEligibility, GuessMode, LetterFeedback, PlayableRound, PublishedRelease, WordAnswer, WordGuess, WordLevel, WordDifficulty } from "../../types/vua-tieng-viet.ts";
import { normalizeSpelling } from "./dictionary-contract.ts";
import { guessCells, lockedPositions } from "./round-hints.ts";
import { variantsFor } from "./letter-variants.ts";
import { isInitialAbsentCount, isUuid } from "./publication-contract.ts";

export type PlayerErrorCode = "NO_RELEASE" | "INVALID_RELEASE" | "EMPTY_LEVEL" | "LOAD_FAILED" | "OFFLINE" | "RELEASE_CHANGED" | "RANDOM_FAILED" | "INVALID_INPUT" | "INCOMPLETE" | "NOT_IN_DICTIONARY";
export class PlayerError extends Error {
  readonly code: PlayerErrorCode;
  constructor(code: PlayerErrorCode) { super(code); this.code = code; }
}
export function baseLetter(letter: string): string {
  return letter.normalize("NFD").replace(/\p{M}/gu, "").replace(/Đ/g, "D");
}

function matchesLetter(guess: string, expected: string, accuracy?: AccentAccuracy): boolean {
  return guess === expected || (accuracy === "optional" && guess === baseLetter(expected));
}

export function evaluateGuess(answer: string, guess: string, accuracy?: AccentAccuracy): LetterFeedback[] {
  const remaining = new Map<string, number>();
  const expected = Array.from(answer), letters = Array.from(guess);
  const feedback: LetterFeedback[] = letters.map((letter, index) => {
    const other = expected[index];
    if (other && matchesLetter(letter, other, accuracy)) return "correct";
    if (other) {
      const key = accuracy ? baseLetter(other) : other;
      remaining.set(key, (remaining.get(key) ?? 0) + 1);
    }
    return "absent";
  });
  letters.forEach((letter, index) => {
    const key = accuracy ? baseLetter(letter) : letter;
    const count = remaining.get(key) ?? 0;
    if (feedback[index] === "correct" || count === 0) return;
    feedback[index] = "present";
    remaining.set(key, count - 1);
  });
  return feedback;
}
export const KEYBOARD_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

export function keyboardKnowledge(guesses: WordGuess[], accuracy?: AccentAccuracy, initialAbsentLetters: readonly string[] = []): Map<string, LetterFeedback> {
  const knowledge = new Map<string, LetterFeedback>();
  const groups = new Map<string, LetterFeedback>();
  const strength = { absent: 0, present: 1, correct: 2 };
  for (const guess of guesses) Array.from(guess.normalized).forEach((letter, index) => {
    const feedback = guess.feedback[index], previous = knowledge.get(letter);
    if (!feedback) return;
    if (!previous || strength[feedback] > strength[previous]) knowledge.set(letter, feedback);
    if (accuracy) {
      const base = baseLetter(letter), group = groups.get(base);
      if (!group || strength[feedback] > strength[group]) groups.set(base, feedback);
    }
  });
  for (const [base, feedback] of groups) {
    for (const letter of variantsFor(base)) {
      if (feedback === "absent") knowledge.set(letter, "absent");
      else if (knowledge.get(letter) === "absent") knowledge.delete(letter);
    }
  }
  for (const base of initialAbsentLetters) {
    knowledge.set(base, "absent");
    for (const letter of variantsFor(base)) knowledge.set(letter, "absent");
  }
  return knowledge;
}
function randomIndex(size: number, randomUint32: () => number): number {
  try {
    const limit = 0x100000000 - (0x100000000 % size);
    for (let tries = 0; tries < 128; tries++) {
      const value = randomUint32();
      if (!Number.isInteger(value) || value < 0 || value >= 0x100000000) throw new PlayerError("RANDOM_FAILED");
      if (value >= limit) continue;
      return value % size;
    }
    throw new PlayerError("RANDOM_FAILED");
  } catch (error) { throw error instanceof PlayerError ? error : new PlayerError("RANDOM_FAILED"); }
}
export function selectAnswer(answers: WordAnswer[], previousId: string | undefined, randomUint32: () => number): WordAnswer {
  if (!answers.length) throw new PlayerError("EMPTY_LEVEL");
  const options = answers.length > 1 ? answers.filter(answer => answer.id !== previousId) : answers;
  return options[randomIndex(options.length, randomUint32)];
}

function initialClues(answer: WordAnswer, count: number, randomUint32: () => number): string[] {
  const excluded = new Set(baseLetter(answer.normalized));
  const candidates = Array.from(KEYBOARD_ROWS.join("")).filter(letter => !excluded.has(letter));
  const clues: string[] = [];
  while (clues.length < count) {
    const index = randomIndex(candidates.length, randomUint32);
    clues.push(candidates[index]);
    candidates.splice(index, 1);
  }
  return clues;
}

type RoundMetadata = { id: string; timestamp: string };
export function startRound(release: PublishedRelease, level: WordLevel, previousId: string | undefined, randomUint32: () => number, metadata: () => RoundMetadata, guessMode: GuessMode = "dictionary", accuracy?: AccentAccuracy, difficulty?: WordDifficulty): PlayableRound {
  try {
    const payload = release.payload, data = payload.levels[level];
    if (!Number.isInteger(payload.attemptLimit) || payload.attemptLimit < 1 || payload.attemptLimit > 12) throw new PlayerError("INVALID_RELEASE");
    if (!data?.guesses.length || !data.answers.length) throw new PlayerError("EMPTY_LEVEL");
    const count = payload.initialAbsentCount ?? 0;
    if (!isInitialAbsentCount(count)) throw new PlayerError("INVALID_RELEASE");
    const answers = data.answers.filter(({ category = "common" }) => category === "common" ||
      difficulty === "expert" || (difficulty === "hard" && (category === "technical" || category === "less-common")));
    const answer = selectAnswer(answers, previousId, randomUint32);
    const clues = count ? initialClues(answer, count, randomUint32) : undefined;
    const { id, timestamp } = metadata();
    if (!isUuid(id) || !Number.isFinite(Date.parse(timestamp))) throw new PlayerError("RANDOM_FAILED");
    return { answer, membership: data.guesses, attributions: payload.attributions.filter(attr => answer.attributionIds.includes(attr.id)), singleAnswerReplay: previousId !== undefined && answers.length === 1, round: { id, releaseId: payload.releaseId, configVersion: payload.configurationId, level, rules: { guessMode, ...(accuracy ? { accuracy } : {}), ...(difficulty ? { difficulty } : {}) }, answerId: answer.id, attemptLimit: payload.attemptLimit, ...(clues ? { initialAbsentLetters: clues } : {}), input: "", guesses: [], status: "playing", revision: 0, startedAt: timestamp, updatedAt: timestamp, endedAt: null } };
  } catch (error) { throw error instanceof PlayerError ? error : new PlayerError("RANDOM_FAILED"); }
}
type Transition = { state: PlayableRound; error: PlayerErrorCode | null };
type MembershipIndex = { exact: ReadonlySet<string>; byBase?: Map<string, string[]> };
const memberships = new WeakMap<string[], MembershipIndex>();

function inDictionary(words: string[], guess: string, accuracy?: AccentAccuracy): boolean {
  let index = memberships.get(words);
  if (!index) {
    index = { exact: new Set(words) };
    memberships.set(words, index);
  }
  if (index.exact.has(guess)) return true;
  if (!accuracy) return false;
  if (!index.byBase) {
    index.byBase = new Map();
    for (const word of words) {
      const base = baseLetter(word);
      const entries = index.byBase.get(base);
      if (entries) entries.push(word);
      else index.byBase.set(base, [word]);
    }
  }
  const letters = Array.from(guess);
  return index.byBase.get(baseLetter(guess))?.some(word =>
    Array.from(word).every((letter, position) => matchesLetter(letters[position] ?? "", letter, "optional"))
  ) ?? false;
}

export function guessEligibility(state: PlayableRound | null, composing = false, unavailable = false): GuessEligibility {
  if (!state || unavailable || state.round.status !== "playing") return { canSubmit: false, reason: "unavailable" };
  if (composing) return { canSubmit: false, reason: "composing" };

  try {
    const normalized = guessCells(state).join("");
    const level = Array.from(normalized).length;
    if (level < state.round.level) return { canSubmit: false, reason: "incomplete" };
    if (level > state.round.level) return { canSubmit: false, reason: "invalid" };
    if (state.round.rules.guessMode === "dictionary") {
      if (!inDictionary(state.membership, normalized, state.round.rules.accuracy)) return { canSubmit: false, reason: "not-in-dictionary" };
    }
    return { canSubmit: true, normalized };
  } catch { return { canSubmit: false, reason: "invalid" }; }
}

export function commitInput(state: PlayableRound, raw: string): Transition {
  if (state.round.status !== "playing") return { state, error: null };
  try {
    if (raw.length > 120) throw new Error("Input too long");
    const spelling = normalizeSpelling(raw);
    if (spelling.level > state.round.level - lockedPositions(state.round).length) return { state, error: "INVALID_INPUT" };
    if (raw === state.round.input) return { state, error: null };
    return { state: { ...state, round: { ...state.round, input: raw, revision: state.round.revision + 1 } }, error: null };
  } catch { return { state, error: "INVALID_INPUT" }; }
}
const eligibilityErrors: Record<Exclude<Extract<GuessEligibility, { canSubmit: false }>["reason"], "composing" | "unavailable">, PlayerErrorCode> = {
  incomplete: "INCOMPLETE",
  invalid: "INVALID_INPUT",
  "not-in-dictionary": "NOT_IN_DICTIONARY",
};
export function submitGuess(state: PlayableRound, expectedRevision: number, metadata: () => RoundMetadata): Transition {
  const round = state.round;
  if (round.revision !== expectedRevision) return { state, error: null };
  const eligibility = guessEligibility(state);
  if (!eligibility.canSubmit) {
    const reason = eligibility.reason;
    return { state, error: reason === "unavailable" || reason === "composing" ? null : eligibilityErrors[reason] };
  }
  const { normalized } = eligibility;
  try {
    const { id, timestamp } = metadata();
    if (!isUuid(id) || !Number.isFinite(Date.parse(timestamp))) throw new Error("Invalid metadata");
    const guess: WordGuess = { id, input: round.input, normalized, feedback: evaluateGuess(state.answer.normalized, normalized, round.rules.accuracy), submittedAt: timestamp };
    const guesses = [...round.guesses, guess];
    const status = guess.feedback.every(feedback => feedback === "correct") ? "won" : guesses.length >= round.attemptLimit ? "lost" : "playing";
    return { state: { ...state, round: { ...round, guesses, input: "", status, revision: round.revision + 1, updatedAt: timestamp, endedAt: status === "playing" ? null : timestamp } }, error: null };
  } catch { return { state, error: "RANDOM_FAILED" }; }
}
