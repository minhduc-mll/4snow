import type { PlayableRound, RoundRules, WordRound } from "../../types/vua-tieng-viet.ts";
import { isRecord, isUuid } from "./publication-contract.ts";
import { attribution, levelData } from "./public-release.ts";
import { commitInput, submitGuess } from "./player-engine.ts";
import { parseStrictJson } from "./strict-json.ts";

export const ROUND_SAVE_KEY = "vtv:round:v1";
export const MAX_ROUND_SAVE_BYTES = 3 * 1024 * 1024;
export class RoundSaveError extends Error {
  readonly code: "invalid" | "incompatible";
  constructor(code: "invalid" | "incompatible") { super(code); this.code = code; }
}
type RoundSnapshot = Pick<PlayableRound,"answer" | "membership" | "attributions"> & {
  releaseId: string; configurationId: string; level: WordRound["level"]; attemptLimit: number;
};
export type RoundSave = {
  schemaVersion: 2 | 3 | 4; normalizerVersion: "vi-nfc-v2"; savedAt: string;
  revision: number; snapshot: RoundSnapshot; round: WordRound; streak?: StoredStreak;
};
export type WinStreak = { current: number; longest: number };
type StoredStreak = WinStreak & { countable: boolean };
export const EMPTY_STREAK: WinStreak = { current: 0, longest: 0 };
const EMPTY_STORED_STREAK: StoredStreak = { ...EMPTY_STREAK, countable: true };

function settleStreak(streak: WinStreak, status: "won" | "lost"): WinStreak {
  if (status === "lost") return { ...streak, current: 0 };
  const current = Math.min(streak.current + 1, Number.MAX_SAFE_INTEGER);
  return { current, longest: Math.max(streak.longest, current) };
}

export function advanceStreak(streak: WinStreak, previous: PlayableRound | null, next: PlayableRound): WinStreak {
  if (previous?.round.id !== next.round.id) {
    return previous?.round.status === "playing" ? { ...streak, current: 0 } : streak;
  }
  if (previous.round.status !== "playing" || next.round.status === "playing") return streak;
  return settleStreak(streak, next.round.status);
}
function exact(value: Record<string,unknown>, keys: string[]) {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key));
}
function timestamp(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function revision(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function invalid(): never { throw new RoundSaveError("invalid"); }
function bounded(text: string) {
  if (text.length > MAX_ROUND_SAVE_BYTES || new TextEncoder().encode(text).length > MAX_ROUND_SAVE_BYTES) invalid();
}
function parseSave(text: string): Record<string, unknown> {
  try {
    bounded(text);
    const value = parseStrictJson(text,undefined,undefined,MAX_ROUND_SAVE_BYTES);
    if (!isRecord(value)) invalid();
    return value;
  } catch { return invalid(); }
}

function readStreak(value: unknown): StoredStreak | null {
  if (!isRecord(value) || !exact(value, ["current", "longest", "countable"]) || !revision(value.current) || !revision(value.longest) || value.current > value.longest || typeof value.countable !== "boolean") return null;
  return { current: value.current, longest: value.longest, countable: value.countable };
}

/** Rebuild all derived gameplay values from the historical public inputs. */
function decodeRound(value: Record<string, unknown>): PlayableRound {
  try {
    if ((value.schemaVersion !== 1 && value.schemaVersion !== 2 && value.schemaVersion !== 3 && value.schemaVersion !== 4) || value.normalizerVersion !== "vi-nfc-v2") throw new RoundSaveError("incompatible");
    const keys = ["schemaVersion","normalizerVersion","savedAt","revision","snapshot","round"];
    if (value.schemaVersion === 4) keys.push("streak");
    if (!exact(value,keys) || !timestamp(value.savedAt) || !revision(value.revision) || !isRecord(value.snapshot) || !isRecord(value.round)) invalid();
    const snapshot = value.snapshot, round = value.round;
    if (!exact(snapshot,["releaseId","configurationId","level","attemptLimit","answer","membership","attributions"]) || !isUuid(snapshot.releaseId) || !isUuid(snapshot.configurationId) || !(snapshot.level === 3 || snapshot.level === 5 || snapshot.level === 7 || snapshot.level === 9) || typeof snapshot.attemptLimit !== "number" || !Number.isInteger(snapshot.attemptLimit) || snapshot.attemptLimit < 1 || snapshot.attemptLimit > 12 || !Array.isArray(snapshot.attributions) || !snapshot.attributions.length || snapshot.attributions.length > 80000) invalid();
    const attributions = snapshot.attributions.map(attribution), ids = new Set(attributions.map(item => item.id));
    if (ids.size !== attributions.length) invalid();
    const data = levelData({ guesses: snapshot.membership, answers: [snapshot.answer] },snapshot.level,ids,new Set());
    const answer = data.answers[0];
    if (!answer || answer.attributionIds.length !== attributions.length) invalid();
    const roundKeys = ["id","releaseId","configVersion","level","answerId","attemptLimit","input","guesses","status","revision","startedAt","updatedAt","endedAt"];
    let rules: RoundRules = { guessMode: "dictionary" };
    if (value.schemaVersion !== 1) {
      roundKeys.push("rules");
      if (!isRecord(round.rules)) invalid();
      const hasAccuracy = value.schemaVersion === 3 || (value.schemaVersion === 4 && Object.hasOwn(round.rules,"accuracy"));
      if (!exact(round.rules,hasAccuracy ? ["guessMode","accuracy"] : ["guessMode"]) || (round.rules.guessMode !== "dictionary" && round.rules.guessMode !== "free")) invalid();
      const { guessMode, accuracy } = round.rules;
      if (hasAccuracy) {
        if (accuracy !== "strict" && accuracy !== "optional") invalid();
        rules = { guessMode, accuracy };
      } else rules = { guessMode };
    }
    if (!exact(round,roundKeys) || !isUuid(round.id) || round.releaseId !== snapshot.releaseId || round.configVersion !== snapshot.configurationId || round.level !== snapshot.level || round.answerId !== answer.id || round.attemptLimit !== snapshot.attemptLimit || typeof round.input !== "string" || round.input.length > 120 || !Array.isArray(round.guesses) || round.guesses.length > snapshot.attemptLimit || !["playing","won","lost"].includes(String(round.status)) || !revision(round.revision) || value.revision !== round.revision || !timestamp(round.startedAt) || !timestamp(round.updatedAt) || round.updatedAt < round.startedAt || value.savedAt < round.updatedAt || !(round.endedAt === null || timestamp(round.endedAt))) invalid();
    let state: PlayableRound = { answer, membership: data.guesses, attributions, singleAnswerReplay: false, round: { id: round.id, releaseId: snapshot.releaseId, configVersion: snapshot.configurationId, level: snapshot.level, rules, answerId: answer.id, attemptLimit: snapshot.attemptLimit, input: "", guesses: [], status: "playing", revision: 0, startedAt: round.startedAt, updatedAt: round.startedAt, endedAt: null } };
    const guessIds = new Set<string>();
    let previousTime = round.startedAt;
    for (const guess of round.guesses) {
      if (!isRecord(guess) || !exact(guess,["id","input","normalized","feedback","submittedAt"]) || !isUuid(guess.id) || guessIds.has(guess.id) || typeof guess.input !== "string" || guess.input.length > 120 || typeof guess.normalized !== "string" || !Array.isArray(guess.feedback) || guess.feedback.length !== snapshot.level || !guess.feedback.every((item: unknown) => item === "correct" || item === "present" || item === "absent") || !timestamp(guess.submittedAt) || guess.submittedAt < previousTime || guess.submittedAt > round.updatedAt || state.round.status !== "playing") invalid();
      guessIds.add(guess.id); previousTime = guess.submittedAt;
      const input = commitInput(state,guess.input);
      if (input.error) invalid();
      const id = guess.id, submittedAt = guess.submittedAt;
      const submitted = submitGuess(input.state,input.state.round.revision,() => ({ id, timestamp: submittedAt }));
      const accepted = submitted.state.round.guesses.at(-1);
      if (submitted.error || !accepted || accepted.normalized !== guess.normalized) invalid();
      state = submitted.state;
    }
    if (round.revision < state.round.guesses.length * 2 + (round.input === "" ? 0 : 1) || round.endedAt !== state.round.endedAt || (state.round.status !== "playing" && (round.input !== "" || round.updatedAt !== round.endedAt))) invalid();
    const editable = commitInput(state,round.input);
    if (editable.error) invalid();
    return { ...editable.state, round: { ...editable.state.round, revision: round.revision, updatedAt: round.updatedAt } };
  } catch (error) { throw error instanceof RoundSaveError ? error : new RoundSaveError("invalid"); }
}
export function decodeRoundSave(text: string): PlayableRound {
  try { return decodeRound(parseSave(text)); }
  catch (error) { throw error instanceof RoundSaveError ? error : new RoundSaveError("invalid"); }
}

export function encodeRoundSave(state: PlayableRound, savedAt: string, streak?: StoredStreak): string {
  try {
    const round = state.round;
    const envelope: RoundSave = { schemaVersion: streak ? 4 : round.rules.accuracy ? 3 : 2, normalizerVersion: "vi-nfc-v2", savedAt, revision: round.revision, snapshot: { releaseId: round.releaseId, configurationId: round.configVersion, level: round.level, attemptLimit: round.attemptLimit, answer: state.answer, membership: state.membership, attributions: state.attributions }, round, streak };
    const text = JSON.stringify(envelope);
    // State entered through a validated release or restore and validated transitions.
    // Avoid reparsing the entire membership on every committed keystroke.
    bounded(text);
    return text;
  } catch (error) { throw error instanceof RoundSaveError ? error : new RoundSaveError("invalid"); }
}
export type RoundRecovery = { kind: "empty" | "invalid" | "incompatible" | "unavailable" } | { kind: "restored"; state: PlayableRound };
type StoragePort = Pick<Storage,"getItem" | "setItem" | "removeItem">;
export type RoundWriteResult = "saved" | "conflict" | "superseded" | "unavailable";
export type RoundResolution = RoundRecovery | { kind: "superseded" };
export type RoundStorageLock = <T>(operation: () => T) => Promise<T>;
function readSnapshot(text: string | null): { state: PlayableRound | null; streak: StoredStreak; error?: RoundSaveError["code"] } {
  if (text === null) return { state: null, streak: EMPTY_STORED_STREAK };
  let streak = EMPTY_STORED_STREAK;
  try {
    const value = parseSave(text);
    // Legacy saves contain one snapshot, which cannot reconstruct prior streaks.
    streak = readStreak(value.streak) ?? EMPTY_STORED_STREAK;
    return { state: decodeRound(value), streak };
  } catch (error) {
    // The counters can remain readable when the round snapshot is damaged.
    return { state: null, streak, error: error instanceof RoundSaveError ? error.code : "invalid" };
  }
}

async function browserLock<T>(operation: () => T): Promise<T> {
  if (typeof navigator === "undefined" || !navigator.locks) throw new Error("Round locking unavailable");
  return navigator.locks.request(ROUND_SAVE_KEY,{ mode: "exclusive" },operation);
}
/** Compare and write under one cross-tab lock; events only notify, never carry trusted state. */
export function createRoundStorage(access: () => StoragePort, lock: RoundStorageLock = browserLock) {
  let baseline: string | null | undefined;
  let protectedSave = true, paused = false, generation = 0;
  let committed: PlayableRound | null = null;
  let streak = EMPTY_STORED_STREAK;
  const pause = () => { paused = true; generation++; };
  const read = (): RoundRecovery => {
    try {
      const text = access().getItem(ROUND_SAVE_KEY);
      const snapshot = readSnapshot(text);
      baseline = text;
      committed = snapshot.state;
      streak = snapshot.streak;
      protectedSave = snapshot.error !== undefined;
      if (snapshot.error) return { kind: snapshot.error };
      return committed ? { kind: "restored", state: committed } : { kind: "empty" };
    } catch {
      protectedSave = true;
      return { kind: "unavailable" };
    }
  };
  const save = (state: PlayableRound, nextStreak: StoredStreak) => {
    const text = encodeRoundSave(state,new Date(Math.max(Date.now(),Date.parse(state.round.updatedAt))).toISOString(),nextStreak);
    access().setItem(ROUND_SAVE_KEY,text);
    baseline = text; committed = state; streak = nextStreak;
  };
  const unchanged = () => access().getItem(ROUND_SAVE_KEY) === baseline;
  return {
    read,
    pause,
    streak: (): WinStreak => ({ current: streak.current, longest: streak.longest }),
    observe(): "unchanged" | "conflict" | "unavailable" {
      try { if (unchanged()) return paused ? "conflict" : "unchanged"; pause(); return "conflict"; }
      catch { pause(); return "unavailable"; }
    },
    async write(state: PlayableRound, replacing = false, localPrevious: PlayableRound | null = null): Promise<RoundWriteResult> {
      const token = generation;
      try {
        return await lock((): RoundWriteResult => {
          if (token !== generation) return "superseded";
          if (paused) return "conflict";
        if (protectedSave && (!replacing || typeof baseline !== "string")) return "unavailable";
          if (!unchanged()) { pause(); return "conflict"; }
          if (committed && (state.round.id === committed.round.id ? state.round.revision <= committed.round.revision : !replacing)) return "superseded";
          const same = committed?.round.id === state.round.id;
          const countable = !same || streak.countable;
          let counts = countable && !protectedSave ? advanceStreak(streak, committed ?? localPrevious, state) : { ...streak, current: 0 };
          // A quota failure may have left the terminal result only in memory.
          // If the same save still owns the lock, settle it atomically with replacement.
          if (replacing && !protectedSave && localPrevious && localPrevious.round.status !== "playing" &&
              (!committed || (streak.countable && committed.round.id === localPrevious.round.id && committed.round.status === "playing" && committed.round.revision < localPrevious.round.revision))) {
            counts = settleStreak(streak, localPrevious.round.status);
          }
          save(state, { ...counts, countable });
          protectedSave = false;
          return "saved";
        });
      } catch { return "unavailable"; }
    },
    async loadSaved(): Promise<RoundResolution> {
      pause(); const token = generation;
      try {
        return await lock((): RoundResolution => {
          if (token !== generation) return { kind: "superseded" };
          const result = read();
          if (result.kind === "restored" || result.kind === "empty") paused = false;
          return result;
        });
      } catch { return { kind: "unavailable" }; }
    },
    async keep(state: PlayableRound): Promise<RoundResolution> {
      pause(); const token = generation;
      try {
        return await lock((): RoundResolution => {
          if (token !== generation) return { kind: "superseded" };
          // Explicit keep-and-replace consents to replacing an unreadable foreign save too.
          const { state: other, streak: savedStreak } = readSnapshot(access().getItem(ROUND_SAVE_KEY));
          const sameRound = other?.round.id === state.round.id ? other : null;
          const chosen = sameRound && sameRound.round.status !== "playing" ? sameRound : state;
          const revision = Math.max(chosen.round.revision,sameRound?.round.revision ?? 0) + 1;
          if (!Number.isSafeInteger(revision)) return { kind: "invalid" };
          const next = decodeRoundSave(encodeRoundSave({ ...chosen, round: { ...chosen.round, revision } },new Date(Math.max(Date.now(),Date.parse(chosen.round.updatedAt))).toISOString()));
          // Reopening a round replaced in another tab cannot award that round again.
          const countable = sameRound ? savedStreak.countable : other === null && committed?.round.id === state.round.id && streak.countable;
          const counts = !countable && sameRound ? { ...savedStreak, current: 0 } : advanceStreak(savedStreak, other, next);
          save(next, { ...counts, longest: Math.max(counts.longest, streak.longest), countable });
          paused = false; protectedSave = false;
          return { kind: "restored", state: next };
        });
      } catch (error) { return { kind: error instanceof RoundSaveError ? error.code : "unavailable" }; }
    },
    async reset(): Promise<RoundWriteResult> {
      const token = ++generation;
      try {
        return await lock((): RoundWriteResult => {
          if (token !== generation) return "superseded";
          if (paused || (baseline !== undefined && !unchanged())) { pause(); return "conflict"; }
          access().removeItem(ROUND_SAVE_KEY); baseline = null; protectedSave = false; committed = null; streak = EMPTY_STORED_STREAK; generation++;
          return "saved";
        });
      } catch { return "unavailable"; }
    },
  };
}
