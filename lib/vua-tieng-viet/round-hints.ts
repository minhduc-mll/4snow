import type { PlayableRound, RoundHint, WordRound } from "../../types/vua-tieng-viet.ts";
import { normalizeSpelling } from "./dictionary-contract.ts";
import { variantsFor } from "./letter-variants.ts";

export const MAX_HINT_CREDITS = 3;
const ambiguousLetters = new Set(Array.from("AEIOUYD").flatMap(variantsFor));

export function lockedPositions(round: WordRound, row = round.guesses.length): number[] {
  return (round.hints ?? []).flatMap(hint => hint.kind === "lock" && hint.row === row ? [hint.position] : []);
}

export function guessCells(state: PlayableRound): string[] {
  const { round, answer } = state;
  const positions = lockedPositions(round);
  const input = Array.from(normalizeSpelling(round.input).normalized);
  if (!positions.length) return input;
  let index = 0;
  const letters = Array.from(answer.normalized);
  return letters.map((letter, position) => positions.includes(position) ? letter : input[index++] ?? "");
}

export function nextRoundHint(state: PlayableRound | null): RoundHint | null {
  if (!state || state.round.status !== "playing") return null;
  const { round, answer } = state;
  const expected = Array.from(answer.normalized);
  const known = new Set((round.hints ?? []).flatMap(hint => hint.kind === "reveal" ? [hint.letter] : []));
  const confirmed = new Set<number>();
  for (const guess of round.guesses) {
    Array.from(guess.normalized).forEach((letter, position) => {
      if (letter === expected[position]) {
        known.add(letter);
        confirmed.add(position);
      } else if (guess.feedback[position] === "present" && (!round.rules.accuracy || !ambiguousLetters.has(letter))) {
        known.add(letter);
      }
    });
  }
  const row = round.guesses.length;
  const letter = expected.find(candidate => !known.has(candidate));
  if (letter) return { kind: "reveal", row, letter };

  const locked = lockedPositions(round);
  const available = expected.map((_, position) => position).filter(position => !locked.includes(position));
  const position = available.find(candidate => !confirmed.has(candidate)) ?? available[0];
  return position === undefined ? null : { kind: "lock", row, position };
}

export function applyRoundHint(state: PlayableRound, hint: RoundHint, updatedAt: string): PlayableRound {
  const round = state.round;
  let input = round.input;
  if (hint.kind === "lock") {
    // Remove only the editable character displaced by the new locked position.
    const editableIndex = hint.position - lockedPositions(round).filter(position => position < hint.position).length;
    let index = 0;
    input = input.replace(/\P{Mark}\p{Mark}*/gu, letter => {
      if (letter === " ") return letter;
      const displaced = index === editableIndex;
      index++;
      return displaced ? "" : letter;
    });
  }
  return { ...state, round: {
    ...round, input, hints: [...(round.hints ?? []), hint], revision: round.revision + 1, updatedAt,
  } };
}

export function hintIdentity(hint: RoundHint): string {
  return hint.kind === "reveal" ? `reveal:${hint.letter}` : `lock:${hint.row}:${hint.position}`;
}
