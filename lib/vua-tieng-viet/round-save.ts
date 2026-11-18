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
  schemaVersion: 2; normalizerVersion: "vi-nfc-v2"; savedAt: string;
  revision: number; snapshot: RoundSnapshot; round: WordRound;
};
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
/** Rebuild all derived gameplay values from the historical public inputs. */
export function decodeRoundSave(text: string): PlayableRound {
  try {
    bounded(text);
    const value = parseStrictJson(text,undefined,undefined,MAX_ROUND_SAVE_BYTES);
    if (!isRecord(value)) invalid();
    if ((value.schemaVersion !== 1 && value.schemaVersion !== 2) || value.normalizerVersion !== "vi-nfc-v2") throw new RoundSaveError("incompatible");
    if (!exact(value,["schemaVersion","normalizerVersion","savedAt","revision","snapshot","round"]) || !timestamp(value.savedAt) || !revision(value.revision) || !isRecord(value.snapshot) || !isRecord(value.round)) invalid();
    const snapshot = value.snapshot, round = value.round;
    if (!exact(snapshot,["releaseId","configurationId","level","attemptLimit","answer","membership","attributions"]) || !isUuid(snapshot.releaseId) || !isUuid(snapshot.configurationId) || !(snapshot.level === 3 || snapshot.level === 5 || snapshot.level === 7 || snapshot.level === 9) || typeof snapshot.attemptLimit !== "number" || !Number.isInteger(snapshot.attemptLimit) || snapshot.attemptLimit < 1 || snapshot.attemptLimit > 12 || !Array.isArray(snapshot.attributions) || !snapshot.attributions.length || snapshot.attributions.length > 80000) invalid();
    const attributions = snapshot.attributions.map(attribution), ids = new Set(attributions.map(item => item.id));
    if (ids.size !== attributions.length) invalid();
    const data = levelData({ guesses: snapshot.membership, answers: [snapshot.answer] },snapshot.level,ids,new Set());
    const answer = data.answers[0];
    if (!answer || answer.attributionIds.length !== attributions.length) invalid();
    const roundKeys = ["id","releaseId","configVersion","level","answerId","attemptLimit","input","guesses","status","revision","startedAt","updatedAt","endedAt"];
    let rules: RoundRules = { guessMode: "dictionary" };
    if (value.schemaVersion === 2) {
      roundKeys.push("rules");
      if (!isRecord(round.rules) || !exact(round.rules,["guessMode"]) || (round.rules.guessMode !== "dictionary" && round.rules.guessMode !== "free")) invalid();
      rules = { guessMode: round.rules.guessMode };
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
export function encodeRoundSave(state: PlayableRound, savedAt: string): string {
  try {
    const round = state.round;
    const envelope: RoundSave = { schemaVersion: 2, normalizerVersion: "vi-nfc-v2", savedAt, revision: round.revision, snapshot: { releaseId: round.releaseId, configurationId: round.configVersion, level: round.level, attemptLimit: round.attemptLimit, answer: state.answer, membership: state.membership, attributions: state.attributions }, round };
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
async function browserLock<T>(operation: () => T): Promise<T> {
  if (typeof navigator === "undefined" || !navigator.locks) throw new Error("Round locking unavailable");
  return navigator.locks.request(ROUND_SAVE_KEY,{ mode: "exclusive" },operation);
}
/** Compare and write under one cross-tab lock; events only notify, never carry trusted state. */
export function createRoundStorage(access: () => StoragePort, lock: RoundStorageLock = browserLock) {
  let baseline: string | null | undefined;
  let protectedSave = true, paused = false, generation = 0;
  let committed: PlayableRound | null = null;
  const pause = () => { paused = true; generation++; };
  const read = (): RoundRecovery => {
    try {
      const text = access().getItem(ROUND_SAVE_KEY);
      baseline = text;
      if (text === null) { baseline = null; protectedSave = false; committed = null; return { kind: "empty" }; }
      const state = decodeRoundSave(text);
      baseline = text; protectedSave = false; committed = state;
      return { kind: "restored", state };
    } catch (error) {
      protectedSave = true;
      return { kind: error instanceof RoundSaveError ? error.code : "unavailable" };
    }
  };
  const save = (state: PlayableRound) => {
    const text = encodeRoundSave(state,new Date(Math.max(Date.now(),Date.parse(state.round.updatedAt))).toISOString());
    access().setItem(ROUND_SAVE_KEY,text);
    baseline = text; committed = state;
  };
  const unchanged = () => access().getItem(ROUND_SAVE_KEY) === baseline;
  return {
    read,
    pause,
    observe(): "unchanged" | "conflict" | "unavailable" {
      try { if (unchanged()) return paused ? "conflict" : "unchanged"; pause(); return "conflict"; }
      catch { pause(); return "unavailable"; }
    },
    async write(state: PlayableRound, replacing = false): Promise<RoundWriteResult> {
      const token = generation;
      try {
        return await lock((): RoundWriteResult => {
          if (token !== generation) return "superseded";
          if (paused) return "conflict";
          if (protectedSave) return "unavailable";
          if (!unchanged()) { pause(); return "conflict"; }
          if (committed && (state.round.id === committed.round.id ? state.round.revision <= committed.round.revision : !replacing)) return "superseded";
          save(state); return "saved";
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
          const text = access().getItem(ROUND_SAVE_KEY);
          let other: PlayableRound | null = null;
          // Explicit keep-and-replace consents to replacing an unreadable foreign save too.
          if (text !== null) { try { other = decodeRoundSave(text); } catch { /* Never reinterpret invalid history. */ } }
          const revision = Math.max(state.round.revision,other?.round.id === state.round.id ? other.round.revision : 0) + 1;
          if (!Number.isSafeInteger(revision)) return { kind: "invalid" };
          const next = decodeRoundSave(encodeRoundSave({ ...state, round: { ...state.round, revision } },new Date(Math.max(Date.now(),Date.parse(state.round.updatedAt))).toISOString()));
          save(next); paused = false; protectedSave = false;
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
          access().removeItem(ROUND_SAVE_KEY); baseline = null; protectedSave = false; committed = null; generation++;
          return "saved";
        });
      } catch { return "unavailable"; }
    },
  };
}
