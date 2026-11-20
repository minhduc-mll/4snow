import { isInitialAbsentCount, isContentHash, isRecord, isRevision, isUuid } from "./publication-contract.ts";
import { normalizeSpelling } from "./dictionary-contract.ts";
export type PlayerSample = { id: string; original: string; normalized: string; level: number; definitionVi: string; attributionIds: string[] };
export type SampleAttribution = { id: string; sourceName: string; attributionText: string; licenseName: string; licenseVersion: string | null; licenseUrl: string; entryUrl: string; historyUrl: string | null; modificationsNotice: string };
type PublicationSource = { id: string; name: string; revision: string };
type ChangeCount = { added: number; removed: number };
export const spellingChangeKinds = ["guessAdded", "guessRemoved", "guessRetained", "answerAdded", "answerRemoved", "answerChanged"] as const;
type SpellingChangeKind = (typeof spellingChangeKinds)[number];
type SpellingChangeGroup = { total: number; items: { level: number; normalized: string }[] };
export type PublicationPreview = { buildId: string; contentHash: string; valid: boolean; errors: { code: string; id?: string; level?: number; normalized?: string }[]; errorCount: number; payloadBytes: number; spellingChanges?: Partial<Record<SpellingChangeKind, SpellingChangeGroup>>; changes: Record<string, { guesses: ChangeCount; answers: ChangeCount }>; coverage: Record<string, { guesses: number; answers: number }>; draftRevision: string; expectedCurrentReleaseId: string | null; configuration: { configurationId: string; attemptLimit: number; initialAbsentCount?: number; normalizerVersion: string }; attributionCount: number; sourceCount: number; sources: PublicationSource[]; playerSamples: Record<string, PlayerSample[]>; sampleAttributions: SampleAttribution[] };
export type PublishResult = { releaseId: string; configurationId: string; payloadHash: string; publishedAt: string; pointerRevision: string };
export type DraftConfiguration = { draftRevision: string; configuration: { configurationId: string; attemptLimit: number; initialAbsentCount?: number; normalizerVersion: "vi-nfc-v2"; levels: [3,5,7,9] } };
export function parseDraftConfiguration(value: unknown): DraftConfiguration {
  if (!isRecord(value) || Object.keys(value).length !== 2 || !isRevision(value.draftRevision) || !isRecord(value.configuration)) throw new Error("INVALID_RESPONSE");
  const config = value.configuration;
  if (Object.keys(config).length !== (Object.hasOwn(config,"initialAbsentCount") ? 5 : 4) || (Object.hasOwn(config,"initialAbsentCount") && !isInitialAbsentCount(config.initialAbsentCount)) || !isUuid(config.configurationId) || typeof config.attemptLimit !== "number" || !Number.isInteger(config.attemptLimit) || config.attemptLimit < 1 || config.attemptLimit > 12 || config.normalizerVersion !== "vi-nfc-v2" || !Array.isArray(config.levels) || config.levels.length !== 4 || config.levels[0] !== 3 || config.levels[1] !== 5 || config.levels[2] !== 7 || config.levels[3] !== 9) throw new Error("INVALID_RESPONSE");
  return { draftRevision: value.draftRevision, configuration: { configurationId: config.configurationId, attemptLimit: config.attemptLimit, ...(isInitialAbsentCount(config.initialAbsentCount) ? { initialAbsentCount: config.initialAbsentCount } : {}), normalizerVersion: "vi-nfc-v2", levels: [3,5,7,9] } };
}
function count(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function parseChange(value: unknown): ChangeCount {
  if (!isRecord(value) || !count(value.added) || !count(value.removed)) throw new Error("INVALID_RESPONSE");
  return { added: value.added, removed: value.removed };
}
function parseSpellingChanges(value: unknown): PublicationPreview["spellingChanges"] {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !isRecord(value.groups)) throw new Error("INVALID_RESPONSE");
  const result: Partial<Record<SpellingChangeKind, SpellingChangeGroup>> = {};
  for (const kind of spellingChangeKinds) {
    const group = value.groups[kind];
    if (group === undefined) continue;
    if (!isRecord(group) || !count(group.total) || group.total === 0 || !Array.isArray(group.items) ||
        group.items.length !== Math.min(30, group.total)) throw new Error("INVALID_RESPONSE");
    const items = group.items.map((item: unknown) => {
      if (!isRecord(item) || typeof item.normalized !== "string" ||
          (item.level !== 3 && item.level !== 5 && item.level !== 7 && item.level !== 9)) throw new Error("INVALID_RESPONSE");
      const spelling = normalizeSpelling(item.normalized);
      if (spelling.level !== item.level || spelling.normalized !== item.normalized) throw new Error("INVALID_RESPONSE");
      return { level: item.level, normalized: item.normalized };
    });
    result[kind] = { total: group.total, items };
  }
  return result;
}
export function parsePublicationPreview(value: unknown): PublicationPreview {
  if (!isRecord(value) || !isUuid(value.buildId) || !isContentHash(value.contentHash) || typeof value.valid !== "boolean" || !Array.isArray(value.errors) || value.errors.length > 100 || !count(value.errorCount) || !count(value.payloadBytes) || !isRecord(value.changes) || !isRevision(value.draftRevision) || !(value.expectedCurrentReleaseId === null || isUuid(value.expectedCurrentReleaseId)) || !isRecord(value.configuration) || !isUuid(value.configuration.configurationId) || (Object.hasOwn(value.configuration,"initialAbsentCount") && !isInitialAbsentCount(value.configuration.initialAbsentCount)) || !count(value.configuration.attemptLimit) || value.configuration.attemptLimit < 1 || value.configuration.attemptLimit > 12 || value.configuration.normalizerVersion !== "vi-nfc-v2" || !count(value.attributionCount) || !count(value.sourceCount) || !Array.isArray(value.sources) || value.sources.length > 100 || value.sources.length > value.sourceCount || !isRecord(value.coverage) || !isRecord(value.playerSamples) || !Array.isArray(value.sampleAttributions) || value.sampleAttributions.length > 12) throw new Error("INVALID_RESPONSE");
  const errors = value.errors.map((error: unknown) => {
    if (!isRecord(error) || typeof error.code !== "string" || error.code.length > 80 || !(error.id === undefined || typeof error.id === "string") || !(error.level === undefined || count(error.level)) || !(error.normalized === undefined || typeof error.normalized === "string")) throw new Error("INVALID_RESPONSE");
    return { code: error.code, ...(typeof error.id === "string" ? { id: error.id } : {}), ...(typeof error.level === "number" ? { level: error.level } : {}), ...(typeof error.normalized === "string" ? { normalized: error.normalized } : {}) };
  });
  const sources = value.sources.map((source: unknown): PublicationSource => {
    if (!isRecord(source) || !isUuid(source.id) || typeof source.name !== "string" || typeof source.revision !== "string") throw new Error("INVALID_RESPONSE");
    return { id: source.id, name: source.name, revision: source.revision };
  });
  const coverage: PublicationPreview["coverage"] = {};
  const changes: PublicationPreview["changes"] = {};
  const playerSamples: PublicationPreview["playerSamples"] = {};
  for (const level of ["3", "5", "7", "9"]) {
    const c = value.coverage[level], samples = value.playerSamples[level];
    if (!isRecord(c) || !count(c.guesses) || !count(c.answers) || !Array.isArray(samples) || samples.length > 3) throw new Error("INVALID_RESPONSE");
    coverage[level] = { guesses: c.guesses, answers: c.answers };
    const delta = value.changes[level];
    if (!isRecord(delta)) throw new Error("INVALID_RESPONSE");
    changes[level] = { guesses: parseChange(delta.guesses), answers: parseChange(delta.answers) };
    playerSamples[level] = samples.map((sample: unknown): PlayerSample => {
      if (!isRecord(sample) || !isUuid(sample.id) || typeof sample.original !== "string" || typeof sample.normalized !== "string" || typeof sample.level !== "number" || typeof sample.definitionVi !== "string" || !Array.isArray(sample.attributionIds) || !sample.attributionIds.every(isUuid)) throw new Error("INVALID_RESPONSE");
      return { id: sample.id, original: sample.original, normalized: sample.normalized, level: sample.level, definitionVi: sample.definitionVi, attributionIds: sample.attributionIds };
    });
  }
  const sampleAttributions = value.sampleAttributions.map((attr: unknown): SampleAttribution => {
    if (!isRecord(attr) || !isUuid(attr.id) || typeof attr.sourceName !== "string" || typeof attr.attributionText !== "string" || typeof attr.licenseName !== "string" || !(attr.licenseVersion === null || typeof attr.licenseVersion === "string") || typeof attr.licenseUrl !== "string" || typeof attr.entryUrl !== "string" || !(attr.historyUrl === null || typeof attr.historyUrl === "string") || typeof attr.modificationsNotice !== "string") throw new Error("INVALID_RESPONSE");
    return { id: attr.id, sourceName: attr.sourceName, attributionText: attr.attributionText, licenseName: attr.licenseName, licenseVersion: attr.licenseVersion, licenseUrl: attr.licenseUrl, entryUrl: attr.entryUrl, historyUrl: attr.historyUrl, modificationsNotice: attr.modificationsNotice };
  });
  return { buildId: value.buildId, contentHash: value.contentHash, valid: value.valid, errors, errorCount: value.errorCount, payloadBytes: value.payloadBytes, spellingChanges: parseSpellingChanges(value.spellingChanges), changes, coverage, draftRevision: value.draftRevision, expectedCurrentReleaseId: value.expectedCurrentReleaseId, configuration: { configurationId: value.configuration.configurationId, attemptLimit: value.configuration.attemptLimit, ...(isInitialAbsentCount(value.configuration.initialAbsentCount) ? { initialAbsentCount: value.configuration.initialAbsentCount } : {}), normalizerVersion: value.configuration.normalizerVersion }, attributionCount: value.attributionCount, sourceCount: value.sourceCount, sources, playerSamples, sampleAttributions };
}
export function parsePublishResult(value: unknown): PublishResult {
  if (!isRecord(value) || !isUuid(value.releaseId) || !isUuid(value.configurationId) || !isContentHash(value.payloadHash) || typeof value.publishedAt !== "string" || !Number.isFinite(Date.parse(value.publishedAt)) || !isRevision(value.pointerRevision)) throw new Error("INVALID_RESPONSE");
  return { releaseId: value.releaseId, configurationId: value.configurationId, payloadHash: value.payloadHash, publishedAt: value.publishedAt, pointerRevision: value.pointerRevision };
}
