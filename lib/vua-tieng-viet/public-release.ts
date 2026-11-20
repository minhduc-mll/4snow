import type { CurrentRelease, PublicAttribution, PublishedRelease, ReleaseLevel, ReleasePayload, WordAnswer, WordLevel } from "../../types/vua-tieng-viet.ts";
import { canonicalJson, normalizeSpelling } from "./dictionary-contract.ts";
import { isInitialAbsentCount, isRecord, isRevision, isUuid } from "./publication-contract.ts";
import { safeHttps } from "./safe-link.ts";
import { parseStrictJson } from "./strict-json.ts";
import { PlayerError } from "./player-engine.ts";

export function isAnswerCategory(value: unknown): value is NonNullable<WordAnswer["category"]> {
  return value === "common" || value === "less-common" || value === "technical" || value === "regional" || value === "rare";
}

const MAX_PAYLOAD = 2 * 1024 * 1024;
function exact(value: Record<string, unknown>, keys: string[]) { return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key)); }
function text(value: unknown, max: number): value is string { return typeof value === "string" && value.trim().length > 0 && Array.from(value).length <= max && new TextEncoder().encode(value).length <= max * 4; }
function nullableText(value: unknown, max: number): value is string | null { return value === null || (typeof value === "string" && Array.from(value).length <= max && new TextEncoder().encode(value).length <= max * 4); }
function hash(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{64}$/.test(value); }
function https(value: unknown): value is string { return text(value,2048) && safeHttps(value) !== null; }
export function attribution(value: unknown): PublicAttribution {
  if (!isRecord(value) || !exact(value,["id","sourceName","sourceEntryId","sourceSenseId","entryUrl","artifactUrl","artifactSha256","resourceRevision","artifactRevision","licenseName","licenseVersion","licenseUrl","attributionText","historyUrl","modificationsNotice"]) || !isUuid(value.id) || !text(value.sourceName,120) || !text(value.sourceEntryId,300) || !nullableText(value.sourceSenseId,300) || !https(value.entryUrl) || !https(value.artifactUrl) || !hash(value.artifactSha256) || !text(value.resourceRevision,200) || !text(value.artifactRevision,128) || !text(value.licenseName,200) || !nullableText(value.licenseVersion,80) || !https(value.licenseUrl) || !text(value.attributionText,4000) || !(value.historyUrl === null || https(value.historyUrl)) || !text(value.modificationsNotice,2000)) throw new PlayerError("INVALID_RELEASE");
  return { id: value.id, sourceName: value.sourceName, sourceEntryId: value.sourceEntryId, sourceSenseId: value.sourceSenseId, entryUrl: value.entryUrl, artifactUrl: value.artifactUrl, artifactSha256: value.artifactSha256, resourceRevision: value.resourceRevision, artifactRevision: value.artifactRevision, licenseName: value.licenseName, licenseVersion: value.licenseVersion, licenseUrl: value.licenseUrl, attributionText: value.attributionText, historyUrl: value.historyUrl, modificationsNotice: value.modificationsNotice };
}
export function levelData(value: unknown, level: WordLevel, attributionIds: Set<string>, answerIds: Set<string>): ReleaseLevel {
  if (!isRecord(value) || !exact(value,["guesses","answers"]) || !Array.isArray(value.guesses) || value.guesses.length > 20000 || !Array.isArray(value.answers) || value.answers.length > 2000) throw new PlayerError("INVALID_RELEASE");
  if (!value.guesses.length || !value.answers.length) throw new PlayerError("EMPTY_LEVEL");
  let previous = "";
  const guesses = value.guesses.map((guess: unknown): string => {
    if (!text(guess,9) || normalizeSpelling(guess).normalized !== guess || Array.from(guess).length !== level || guess <= previous) throw new PlayerError("INVALID_RELEASE");
    previous = guess;
    return guess;
  });
  const membership = new Set(guesses);
  previous = "";
  const answers = value.answers.map((answer: unknown): WordAnswer => {
    if (!isRecord(answer) || !exact(answer,["id","original","normalized","level","definitionVi","attributionIds", ...(Object.hasOwn(answer,"category") ? ["category"] : [])]) || (Object.hasOwn(answer,"category") && !isAnswerCategory(answer.category)) || !isUuid(answer.id) || answerIds.has(answer.id) || !text(answer.original,120) || !text(answer.normalized,9) || normalizeSpelling(answer.original).normalized !== answer.normalized || Array.from(answer.normalized).length !== level || answer.normalized <= previous || answer.level !== level || !membership.has(answer.normalized) || !text(answer.definitionVi,2000) || !Array.isArray(answer.attributionIds) || !answer.attributionIds.length || answer.attributionIds.length > attributionIds.size || !answer.attributionIds.every((id: unknown): id is string => isUuid(id) && attributionIds.has(id)) || new Set(answer.attributionIds).size !== answer.attributionIds.length) throw new PlayerError("INVALID_RELEASE");
    previous = answer.normalized; answerIds.add(answer.id);
    return { id: answer.id, original: answer.original, normalized: answer.normalized, level, definitionVi: answer.definitionVi, attributionIds: answer.attributionIds, ...(isAnswerCategory(answer.category) ? { category: answer.category } : {}) };
  });
  return { guesses, answers };
}
export function parseReleasePayload(value: unknown): ReleasePayload {
  try {
    if (!isRecord(value) || !exact(value,["schemaVersion","normalizerVersion","releaseId","configurationId","attemptLimit","levels","attributions", ...(Object.hasOwn(value,"initialAbsentCount") ? ["initialAbsentCount"] : [])]) || (Object.hasOwn(value,"initialAbsentCount") && !isInitialAbsentCount(value.initialAbsentCount)) || value.schemaVersion !== 1 || value.normalizerVersion !== "vi-nfc-v2" || !isUuid(value.releaseId) || !isUuid(value.configurationId) || typeof value.attemptLimit !== "number" || !Number.isInteger(value.attemptLimit) || value.attemptLimit < 1 || value.attemptLimit > 12 || !isRecord(value.levels) || !exact(value.levels,["3","5","7","9"]) || !Array.isArray(value.attributions) || !value.attributions.length || value.attributions.length > 80000 || new TextEncoder().encode(canonicalJson(value)).length > MAX_PAYLOAD) throw new PlayerError("INVALID_RELEASE");
    const attributions = value.attributions.map(attribution), ids = new Set(attributions.map(attr => attr.id));
    if (ids.size !== attributions.length) throw new PlayerError("INVALID_RELEASE");
    const answerIds = new Set<string>();
    return { schemaVersion: 1, normalizerVersion: "vi-nfc-v2", releaseId: value.releaseId, configurationId: value.configurationId, attemptLimit: value.attemptLimit, ...(isInitialAbsentCount(value.initialAbsentCount) ? { initialAbsentCount: value.initialAbsentCount } : {}), levels: { 3: levelData(value.levels[3],3,ids,answerIds), 5: levelData(value.levels[5],5,ids,answerIds), 7: levelData(value.levels[7],7,ids,answerIds), 9: levelData(value.levels[9],9,ids,answerIds) }, attributions };
  } catch (error) { throw error instanceof PlayerError ? error : new PlayerError("INVALID_RELEASE"); }
}
export async function validateReleaseRow(value: unknown, expectedId: string): Promise<PublishedRelease> {
  try {
    if (!Array.isArray(value) || value.length !== 1) throw new PlayerError("INVALID_RELEASE");
    const row: unknown = value[0];
    if (!isRecord(row) || !exact(row,["id","schema_version","normalizer_version","configuration_id","attempt_limit","published_at","public_payload","payload_sha256"]) || row.id !== expectedId || row.schema_version !== 1 || row.normalizer_version !== "vi-nfc-v2" || !hash(row.payload_sha256) || typeof row.published_at !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|\+00:00)$/.test(row.published_at) || !Number.isFinite(Date.parse(row.published_at)) || new Date(row.published_at).toISOString().slice(0,19) !== row.published_at.slice(0,19)) throw new PlayerError("INVALID_RELEASE");
    const payload = parseReleasePayload(row.public_payload);
    if (payload.releaseId !== expectedId || payload.configurationId !== row.configuration_id || payload.attemptLimit !== row.attempt_limit) throw new PlayerError("INVALID_RELEASE");
    const digest = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(canonicalJson(payload)));
    const actual = Array.from(new Uint8Array(digest),byte => byte.toString(16).padStart(2,"0")).join("");
    if (actual !== row.payload_sha256) throw new PlayerError("INVALID_RELEASE");
    return { payload, payloadHash: actual, publishedAt: row.published_at };
  } catch (error) { throw error instanceof PlayerError ? error : new PlayerError("INVALID_RELEASE"); }
}
export function parseCurrentRelease(value: unknown): CurrentRelease {
  if (Array.isArray(value) && value.length === 0) throw new PlayerError("NO_RELEASE");
  if (!Array.isArray(value) || value.length !== 1) throw new PlayerError("INVALID_RELEASE");
  const row: unknown = value[0];
  if (!isRecord(row) || !exact(row,["release_id","pointer_revision"]) || !isUuid(row.release_id) || !isRevision(row.pointer_revision) || row.pointer_revision === "0") throw new PlayerError("INVALID_RELEASE");
  return { releaseId: row.release_id, pointerRevision: row.pointer_revision };
}
export type PublishedTransport = { pointer: () => Promise<CurrentRelease>; release: (id: string) => Promise<PublishedRelease> };
export async function loadCurrentRelease(transport: PublishedTransport): Promise<PublishedRelease> {
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = await transport.pointer();
      const release = await transport.release(before.releaseId);
      const after = await transport.pointer();
      if (before.releaseId === after.releaseId && before.pointerRevision === after.pointerRevision && release.payload.releaseId === before.releaseId) return release;
    }
    throw new PlayerError("RELEASE_CHANGED");
  } catch (error) { throw error instanceof PlayerError ? error : new PlayerError("LOAD_FAILED"); }
}
export async function readPublicJson(response: Response, maxBytes: number): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new PlayerError("LOAD_FAILED");
  try {
    if (Number(response.headers.get("Content-Length")) > maxBytes) { await reader.cancel(); throw new PlayerError("INVALID_RELEASE"); }
    const decoder = new TextDecoder("utf-8",{ fatal: true });
    let bytes = 0, result = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); throw new PlayerError("INVALID_RELEASE"); }
      result += decoder.decode(chunk.value,{ stream: true });
    }
    return parseStrictJson(result + decoder.decode(),undefined,undefined,maxBytes);
  } catch (error) { throw error instanceof PlayerError ? error : new PlayerError("INVALID_RELEASE"); }
  finally { reader.releaseLock(); }
}
