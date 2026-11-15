import type { LetterFeedback, PlayableRound, PublishedRelease, WordAnswer, WordGuess, WordLevel } from "../../types/vua-tieng-viet.ts";
import { normalizeSpelling } from "./dictionary-contract.ts";
import { isUuid } from "./publication-contract.ts";

export type PlayerErrorCode = "NO_RELEASE" | "INVALID_RELEASE" | "EMPTY_LEVEL" | "LOAD_FAILED" | "OFFLINE" | "RELEASE_CHANGED" | "RANDOM_FAILED" | "INVALID_INPUT" | "INCOMPLETE" | "NOT_IN_DICTIONARY" | "ABSENT_LETTER";
export class PlayerError extends Error {
  readonly code: PlayerErrorCode;
  constructor(code: PlayerErrorCode) { super(code); this.code = code; }
}
export function evaluateGuess(answer: string, guess: string): LetterFeedback[] {
  const remaining = new Map<string, number>();
  const expected = Array.from(answer), letters = Array.from(guess);
  const feedback: LetterFeedback[] = letters.map((letter, index) => {
    if (letter === expected[index]) return "correct";
    const other = expected[index];
    if (other) remaining.set(other, (remaining.get(other) ?? 0) + 1);
    return "absent";
  });
  letters.forEach((letter, index) => {
    if (feedback[index] === "correct" || !(remaining.get(letter) ?? 0)) return;
    feedback[index] = "present";
    remaining.set(letter, (remaining.get(letter) ?? 0) - 1);
  });
  return feedback;
}
export function keyboardKnowledge(guesses: WordGuess[]): Map<string, LetterFeedback> {
  const knowledge = new Map<string, LetterFeedback>();
  const strength = { absent: 0, present: 1, correct: 2 };
  for (const guess of guesses) Array.from(guess.normalized).forEach((letter, index) => {
    const feedback = guess.feedback[index], previous = knowledge.get(letter);
    if (feedback && (!previous || strength[feedback] > strength[previous])) knowledge.set(letter, feedback);
  });
  return knowledge;
}
export function selectAnswer(answers: WordAnswer[], previousId: string | undefined, randomUint32: () => number): WordAnswer {
  try {
    if (!answers.length) throw new PlayerError("EMPTY_LEVEL");
    const options = answers.length > 1 ? answers.filter(answer => answer.id !== previousId) : answers;
    const limit = 0x100000000 - (0x100000000 % options.length);
    for (let tries = 0; tries < 128; tries++) {
      const value = randomUint32();
      if (!Number.isInteger(value) || value < 0 || value >= 0x100000000) throw new PlayerError("RANDOM_FAILED");
      if (value >= limit) continue;
      const answer = options[value % options.length];
      if (answer) return answer;
    }
    throw new PlayerError("RANDOM_FAILED");
  } catch (error) { throw error instanceof PlayerError ? error : new PlayerError("RANDOM_FAILED"); }
}
type RoundMetadata = { id: string; timestamp: string };
export function startRound(release: PublishedRelease, level: WordLevel, previousId: string | undefined, randomUint32: () => number, metadata: () => RoundMetadata): PlayableRound {
  try {
    const payload = release.payload, data = payload.levels[level];
    if (!Number.isInteger(payload.attemptLimit) || payload.attemptLimit < 1 || payload.attemptLimit > 12) throw new PlayerError("INVALID_RELEASE");
    if (!data?.guesses.length || !data.answers.length) throw new PlayerError("EMPTY_LEVEL");
    const answer = selectAnswer(data.answers, previousId, randomUint32);
    const { id, timestamp } = metadata();
    if (!isUuid(id) || !Number.isFinite(Date.parse(timestamp))) throw new PlayerError("RANDOM_FAILED");
    return { answer, membership: data.guesses, attributions: payload.attributions.filter(attr => answer.attributionIds.includes(attr.id)), singleAnswerReplay: previousId !== undefined && data.answers.length === 1, round: { id, releaseId: payload.releaseId, configVersion: payload.configurationId, level, answerId: answer.id, attemptLimit: payload.attemptLimit, input: "", guesses: [], status: "playing", revision: 0, startedAt: timestamp, updatedAt: timestamp, endedAt: null } };
  } catch (error) { throw error instanceof PlayerError ? error : new PlayerError("RANDOM_FAILED"); }
}
type Transition = { state: PlayableRound; error: PlayerErrorCode | null };
export function commitInput(state: PlayableRound, raw: string): Transition {
  if (state.round.status !== "playing") return { state, error: null };
  try {
    if (raw.length > 120) throw new Error("Input too long");
    const spelling = normalizeSpelling(raw);
    if (spelling.level > state.round.level) return { state, error: "INVALID_INPUT" };
    const knowledge = keyboardKnowledge(state.round.guesses);
    if (Array.from(spelling.normalized).some(letter => knowledge.get(letter) === "absent")) return { state, error: "ABSENT_LETTER" };
    if (raw === state.round.input) return { state, error: null };
    return { state: { ...state, round: { ...state.round, input: raw, revision: state.round.revision + 1 } }, error: null };
  } catch { return { state, error: "INVALID_INPUT" }; }
}
export function submitGuess(state: PlayableRound, expectedRevision: number, metadata: () => RoundMetadata): Transition {
  const round = state.round;
  if (round.status !== "playing" || round.revision !== expectedRevision) return { state, error: null };
  try {
    const spelling = normalizeSpelling(round.input);
    if (spelling.level !== round.level) return { state, error: "INCOMPLETE" };
    if (!state.membership.includes(spelling.normalized)) return { state, error: "NOT_IN_DICTIONARY" };
    const { id, timestamp } = metadata();
    if (!isUuid(id) || !Number.isFinite(Date.parse(timestamp))) throw new Error("Invalid metadata");
    const guess: WordGuess = { id, input: round.input, normalized: spelling.normalized, feedback: evaluateGuess(state.answer.normalized, spelling.normalized), submittedAt: timestamp };
    const guesses = [...round.guesses, guess];
    const status = spelling.normalized === state.answer.normalized ? "won" : guesses.length >= round.attemptLimit ? "lost" : "playing";
    return { state: { ...state, round: { ...round, guesses, input: "", status, revision: round.revision + 1, updatedAt: timestamp, endedAt: status === "playing" ? null : timestamp } }, error: null };
  } catch { return { state, error: "RANDOM_FAILED" }; }
}
