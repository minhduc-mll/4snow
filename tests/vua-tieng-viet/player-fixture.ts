import { createHash } from "node:crypto";
import { canonicalJson } from "../../lib/vua-tieng-viet/dictionary-contract.ts";
import type { ReleasePayload, WordLevel } from "../../types/vua-tieng-viet.ts";
export const fixtureId = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function playerPayload(attemptLimit = 6): ReleasePayload {
  const words: [WordLevel, string, string][] = [[3,"mèo","MÈO"],[5,"hoa hồ","HOAHỒ"],[7,"đất nước","ĐẤTNƯỚC"],[9,"tiếng Việt","TIẾNGVIỆT"]];
  const levels: ReleasePayload["levels"] = { 3: { guesses: [], answers: [] }, 5: { guesses: [], answers: [] }, 7: { guesses: [], answers: [] }, 9: { guesses: [], answers: [] } };
  for (const [level, original, normalized] of words) levels[level] = { guesses: ["A".repeat(level), normalized, ...(level === 3 ? ["MEO", "SÔI"] : [])].sort(), answers: [{ id: fixtureId(level), original, normalized, level, definitionVi: `Nghĩa tiếng Việt đã duyệt cho ${original}.`, attributionIds: [fixtureId(80)] }] };
  return { schemaVersion: 1, normalizerVersion: "vi-nfc-v2", releaseId: fixtureId(90), configurationId: fixtureId(91), attemptLimit, levels, attributions: [{ id: fixtureId(80), sourceName: "Synthetic source", sourceEntryId: "entry", sourceSenseId: "selected-sense", entryUrl: "https://example.invalid/entry", artifactUrl: "https://example.invalid/artifact", artifactSha256: "a".repeat(64), resourceRevision: "source-v1", artifactRevision: "artifact-v1", licenseName: "Synthetic", licenseVersion: null, licenseUrl: "https://example.invalid/license", attributionText: "Synthetic credit", historyUrl: null, modificationsNotice: "Synthetic modifications" }] };
}
export function playerReleaseRow(payload = playerPayload()) {
  return { id: payload.releaseId, schema_version: 1, normalizer_version: payload.normalizerVersion, configuration_id: payload.configurationId, attempt_limit: payload.attemptLimit, published_at: "2026-11-14T00:00:00+00:00", public_payload: payload, payload_sha256: createHash("sha256").update(canonicalJson(payload)).digest("hex") };
}
