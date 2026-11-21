"use client";

import * as React from "react";
import { requestPrivateDictionary } from "@/lib/vua-tieng-viet/private-request";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminSessionGeneration } from "@/hooks/useAdminAuth";
import { isReviewStatus, parseEditorialRequest, type Category, type ExclusionChecks, type Filters, type ReviewInput, type ReviewStatus, type RightsDecision, type RightsReviewInput, type SelectAnswerInput } from "@/lib/vua-tieng-viet/editorial-contract";

import { parseCollisionPage } from "@/lib/vua-tieng-viet/collision-response";

type Summary = { id: string; sourceId: string; original: string; normalized: string; level: number; definitionVi: string | null; review: ReviewStatus; collision: boolean; revisionNumber: number };
type Revision = { id: string; revisionNumber: number; original: string; normalized: string; level: number; definitionVi: string | null; review: ReviewStatus; answerEligible: boolean; category: Category | null; rationale: string | null; exclusionChecks: ExclusionChecks | null; createdAt: string | null; actorRole: string | null; bulkBatchId: string | null };
type HistoryPage = { items: Revision[]; nextCursor: string | null };
type Attribution = { id: string; sourceName: string; sourceEntryId: string; sourceSenseId: string | null; entryUrl: string; artifactUrl: string; artifactSha256: string; resourceRevision: string; artifactRevision: string; licenseName: string; licenseVersion: string | null; licenseUrl: string; attributionText: string; historyUrl: string | null; modificationsNotice: string };
type RightsReview = { id: string; previousReviewId: string | null; decision: RightsDecision; evidence: string; obligations: string; createdAt: string; actorRole: string };
type Detail = { id: string; sourceId: string; rightsReview: RightsReview | null; attributionPreview: Attribution; entryUrl: string; sourceEntryId: string; sourceSenseId: string | null; sourceNotes: string | null; source: { name: string; artifactUrl: string; artifactSha256: string; resourceRevision: string; originDump: string | null; retrievedAt: string; rights: { licenseName: string; licenseVersion: string | null; licenseUrl: string; attributionText: string; historyUrl: string | null; redistributionNote: string; modificationsNotice: string } }; current: Revision; draftRevision: string; history: HistoryPage };
type ListPage = { items: Summary[]; nextCursor: string | null; draftRevision: string };
const ROOT = ["vtv-private", "editorial"];

function rec(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function category(value: unknown): value is Category | null { return value === null || value === "common" || value === "regional" || value === "technical" || value === "less-common" || value === "rare" || value === "excluded"; }
function nullableString(value: unknown): value is string | null { return value === null || typeof value === "string"; }
function attribution(value: unknown): Attribution {
  if (!rec(value) || typeof value.id !== "string" || typeof value.sourceName !== "string" || typeof value.sourceEntryId !== "string" || !nullableString(value.sourceSenseId) || typeof value.entryUrl !== "string" || typeof value.artifactUrl !== "string" || typeof value.artifactSha256 !== "string" || typeof value.resourceRevision !== "string" || typeof value.artifactRevision !== "string" || typeof value.licenseName !== "string" || !nullableString(value.licenseVersion) || typeof value.licenseUrl !== "string" || typeof value.attributionText !== "string" || !nullableString(value.historyUrl) || typeof value.modificationsNotice !== "string") throw new Error("INVALID_RESPONSE");
  return { id: value.id, sourceName: value.sourceName, sourceEntryId: value.sourceEntryId, sourceSenseId: value.sourceSenseId, entryUrl: value.entryUrl, artifactUrl: value.artifactUrl, artifactSha256: value.artifactSha256, resourceRevision: value.resourceRevision, artifactRevision: value.artifactRevision, licenseName: value.licenseName, licenseVersion: value.licenseVersion, licenseUrl: value.licenseUrl, attributionText: value.attributionText, historyUrl: value.historyUrl, modificationsNotice: value.modificationsNotice };
}
function rightsReview(value: unknown): RightsReview | null {
  if (value === null) return null;
  if (!rec(value) || typeof value.id !== "string" || !nullableString(value.previousReviewId) || !(value.decision === "cleared" || value.decision === "unresolved" || value.decision === "rejected") || typeof value.evidence !== "string" || typeof value.obligations !== "string" || typeof value.createdAt !== "string" || typeof value.actorRole !== "string") throw new Error("INVALID_RESPONSE");
  return { id: value.id, previousReviewId: value.previousReviewId, decision: value.decision, evidence: value.evidence, obligations: value.obligations, createdAt: value.createdAt, actorRole: value.actorRole };
}
function checks(value: unknown): value is ExclusionChecks | null { return value === null || (rec(value) && typeof value.names === "boolean" && typeof value.abbreviations === "boolean" && typeof value.offensive === "boolean" && typeof value.malformed === "boolean" && typeof value.unverified === "boolean"); }
function revision(value: unknown): Revision {
  if (!rec(value) || typeof value.id !== "string" || typeof value.revisionNumber !== "number" || typeof value.original !== "string" || typeof value.normalized !== "string" || typeof value.level !== "number" || !nullableString(value.definitionVi) || !isReviewStatus(value.review) || typeof value.answerEligible !== "boolean" || !category(value.category) || !nullableString(value.rationale) || !checks(value.exclusionChecks)) throw new Error("INVALID_RESPONSE");
  return { id: value.id, revisionNumber: value.revisionNumber, original: value.original, normalized: value.normalized, level: value.level, definitionVi: value.definitionVi, review: value.review, answerEligible: value.answerEligible, category: value.category, rationale: value.rationale, exclusionChecks: value.exclusionChecks, createdAt: typeof value.createdAt === "string" ? value.createdAt : null, actorRole: typeof value.actorRole === "string" ? value.actorRole : null, bulkBatchId: typeof value.bulkBatchId === "string" ? value.bulkBatchId : null };
}
function history(value: unknown): HistoryPage {
  if (!rec(value) || !Array.isArray(value.items) || value.items.length > 50 || !nullableString(value.nextCursor)) throw new Error("INVALID_RESPONSE");
  return { items: value.items.map(revision), nextCursor: value.nextCursor };
}
function list(value: unknown): ListPage {
  if (!rec(value) || !Array.isArray(value.items) || value.items.length > 100 || !nullableString(value.nextCursor) || typeof value.draftRevision !== "string") throw new Error("INVALID_RESPONSE");
  const items = value.items.map((item: unknown): Summary => {
    if (!rec(item) || typeof item.id !== "string" || typeof item.sourceId !== "string" || typeof item.original !== "string" || typeof item.normalized !== "string" || typeof item.level !== "number" || !nullableString(item.definitionVi) || !isReviewStatus(item.review) || typeof item.collision !== "boolean" || typeof item.revisionNumber !== "number") throw new Error("INVALID_RESPONSE");
    return { id: item.id, sourceId: item.sourceId, original: item.original, normalized: item.normalized, level: item.level, definitionVi: item.definitionVi, review: item.review, collision: item.collision, revisionNumber: item.revisionNumber };
  });
  return { items, nextCursor: value.nextCursor, draftRevision: value.draftRevision };
}
function detail(value: unknown): Detail {
  if (!rec(value) || typeof value.id !== "string" || typeof value.entryUrl !== "string" || typeof value.sourceEntryId !== "string" || !nullableString(value.sourceSenseId) || !nullableString(value.sourceNotes) || !rec(value.source) || typeof value.source.name !== "string" || typeof value.source.artifactUrl !== "string" || typeof value.source.artifactSha256 !== "string" || typeof value.source.resourceRevision !== "string" || !nullableString(value.source.originDump) || typeof value.source.retrievedAt !== "string" || !rec(value.source.rights) || typeof value.source.rights.licenseName !== "string" || !nullableString(value.source.rights.licenseVersion) || typeof value.source.rights.licenseUrl !== "string" || typeof value.source.rights.attributionText !== "string" || !nullableString(value.source.rights.historyUrl) || typeof value.source.rights.redistributionNote !== "string" || typeof value.source.rights.modificationsNotice !== "string" || typeof value.draftRevision !== "string") throw new Error("INVALID_RESPONSE");
  if (typeof value.sourceId !== "string") throw new Error("INVALID_RESPONSE");
  return { id: value.id, sourceId: value.sourceId, rightsReview: rightsReview(value.rightsReview), attributionPreview: attribution(value.attributionPreview), entryUrl: value.entryUrl, sourceEntryId: value.sourceEntryId, sourceSenseId: value.sourceSenseId, sourceNotes: value.sourceNotes, source: { name: value.source.name, artifactUrl: value.source.artifactUrl, artifactSha256: value.source.artifactSha256, resourceRevision: value.source.resourceRevision, originDump: value.source.originDump, retrievedAt: value.source.retrievedAt, rights: { licenseName: value.source.rights.licenseName, licenseVersion: value.source.rights.licenseVersion, licenseUrl: value.source.rights.licenseUrl, attributionText: value.source.rights.attributionText, historyUrl: value.source.rights.historyUrl, redistributionNote: value.source.rights.redistributionNote, modificationsNotice: value.source.rights.modificationsNotice } }, current: revision(value.current), draftRevision: value.draftRevision, history: history(value.history) };
}

export function useRightsReviewForm(sourceId: string, draftRevision: string, current: RightsReview | null, save: (input: RightsReviewInput, retry: boolean) => Promise<boolean>) {
  const [decision, setDecision] = React.useState<RightsDecision>(current?.decision ?? "unresolved");
  const [evidence, setEvidence] = React.useState(current?.evidence ?? "");
  const [obligations, setObligations] = React.useState(current?.obligations ?? "");
  const [invalid, setInvalid] = React.useState(false);
  const [baseline, setBaseline] = React.useState(current);
  const changed = decision !== (baseline?.decision ?? "unresolved") || evidence !== (baseline?.evidence ?? "") || obligations !== (baseline?.obligations ?? "");
  const stale = changed && (baseline?.id ?? null) !== (current?.id ?? null);
  const reset = () => {
    setBaseline(current); setDecision(current?.decision ?? "unresolved"); setEvidence(current?.evidence ?? ""); setObligations(current?.obligations ?? ""); setInvalid(false);
  };
  if (!changed && (baseline?.id ?? null) !== (current?.id ?? null)) reset();
  const input: RightsReviewInput = { sourceId, expectedDraftRevision: draftRevision, decision, evidence, obligations };
  const submit = async (): Promise<boolean> => {
    if (stale) return false;
    try {
      parseEditorialRequest({ operation: "rights-review", requestId: "00000000-0000-4000-8000-000000000001", idempotencyKey: "00000000-0000-4000-8000-000000000002", input });
      setInvalid(false);
      return await save(input, false);
    } catch { setInvalid(true); return false; }
  };
  const changeDecision = (next: string): void => { if (next === "cleared" || next === "unresolved" || next === "rejected") setDecision(next); };
  return { decision, changeDecision, evidence, setEvidence, obligations, setObligations, dirty: changed, stale, invalid, submit, reset, retry: () => save(input, true) };
}

export function useCandidateEditorial(onUnauthorized: () => void) {
  const client = useQueryClient();
  const [filters, setFilters] = React.useState<Filters>({ sourceId: null, level: null, review: null, hasDefinition: null, collisionsOnly: false });
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [historyCursor, setHistoryCursor] = React.useState<string | null>(null);
  const [collisionCursor, setCollisionCursor] = React.useState<string | null>(null);
  const pendingSelection = React.useRef<{ input: SelectAnswerInput; idempotencyKey: string } | null>(null);
  const [canRetrySelection, setCanRetrySelection] = React.useState(false);
  const pending = React.useRef<{ input: ReviewInput; idempotencyKey: string } | null>(null);
  const pendingRights = React.useRef<{ input: RightsReviewInput; idempotencyKey: string } | null>(null);
  const [canRetry, setCanRetry] = React.useState(false);
  const [canRetryRights, setCanRetryRights] = React.useState(false);
  const [reviewSaves, setReviewSaves] = React.useState(0);
  const [rightsSaves, setRightsSaves] = React.useState(0);
  const active = React.useRef(true);
  const controller = React.useRef<AbortController | null>(null);
  React.useEffect(() => { active.current = true; return () => { active.current = false; controller.current?.abort(); pending.current = null; pendingRights.current = null; pendingSelection.current = null; }; }, []);
  const call = React.useCallback(async (operation: string, input: unknown, signal: AbortSignal, idempotencyKey?: string): Promise<unknown> => {
    return requestPrivateDictionary({ operation, requestId: crypto.randomUUID(), input, ...(idempotencyKey ? { idempotencyKey } : {}) }, signal, onUnauthorized);
  }, [onUnauthorized]);
  const listQuery = useQuery({ queryKey: [...ROOT, "list", filters, cursor], queryFn: async ({ signal }) => list(await call("list", { filters, cursor, limit: 50 }, signal)), enabled: process.env.NEXT_PUBLIC_VTV_IMPORT_ENABLED === "true", retry: false, gcTime: 0 });
  const detailQuery = useQuery({ queryKey: [...ROOT, "detail", selected], queryFn: async ({ signal }) => detail(await call("detail", { entryId: selected }, signal)), enabled: selected !== null, retry: false, gcTime: 0 });
  const historyQuery = useQuery({ queryKey: [...ROOT, "history", selected, historyCursor], queryFn: async ({ signal }) => history(await call("list-history", { entryId: selected, cursor: historyCursor, limit: 50 }, signal)), enabled: selected !== null && historyCursor !== null, retry: false, gcTime: 0 });
  const spelling = detailQuery.data?.current;
  const collisionQuery = useQuery({ queryKey: [...ROOT, "collision", spelling?.normalized, spelling?.level, collisionCursor], queryFn: async ({ signal }) => parseCollisionPage(await call("collision", { normalized: spelling?.normalized, level: spelling?.level, cursor: collisionCursor, limit: 25 }, signal)), enabled: spelling !== undefined, retry: false, gcTime: 0 });
  const selectionMutation = useMutation({ mutationKey: [...ROOT, "select-answer"], retry: false, gcTime: 0, mutationFn: async (value: { input: SelectAnswerInput; idempotencyKey: string }) => { controller.current = new AbortController(); return call("select-answer", value.input, controller.current.signal, value.idempotencyKey); } });
  const mutation = useMutation({ mutationKey: [...ROOT, "review"], retry: false, gcTime: 0, mutationFn: async (value: { input: ReviewInput; idempotencyKey: string }) => { controller.current = new AbortController(); return call("review", value.input, controller.current.signal, value.idempotencyKey); } });
  const rightsMutation = useMutation({ mutationKey: [...ROOT, "rights-review"], retry: false, gcTime: 0, mutationFn: async (value: { input: RightsReviewInput; idempotencyKey: string }) => { controller.current = new AbortController(); return call("rights-review", value.input, controller.current.signal, value.idempotencyKey); } });
  const saveRights = React.useCallback(async (input: RightsReviewInput, retry: boolean): Promise<boolean> => {
    const session = adminSessionGeneration();
    try {
      const value = retry && pendingRights.current ? pendingRights.current : { input, idempotencyKey: crypto.randomUUID() };
      pendingRights.current = value; setCanRetryRights(false);
      await rightsMutation.mutateAsync(value);
      if (!active.current || session !== adminSessionGeneration()) return false;
      pendingRights.current = null;
      await client.invalidateQueries({ queryKey: ROOT });
      await client.invalidateQueries({ queryKey: ["vtv-private", "publication", "draft"] });
      setRightsSaves(count => count + 1);
      return true;
    } catch (error) {
      if (!active.current || session !== adminSessionGeneration()) return false;
      if (error instanceof Error && error.message === "REVISION_CONFLICT") { pendingRights.current = null; await client.invalidateQueries({ queryKey: ROOT }); }
      else if (error instanceof Error && (error.message === "UNAVAILABLE" || error.message === "RATE_LIMITED")) setCanRetryRights(true);
      else pendingRights.current = null;
      return false;
    }
  }, [client, rightsMutation]);
  const save = React.useCallback(async (input: ReviewInput, retry: boolean): Promise<boolean> => {
    const session = adminSessionGeneration();
    try {
      const value = retry && pending.current ? pending.current : { input, idempotencyKey: crypto.randomUUID() };
      pending.current = value; setCanRetry(false);
      await mutation.mutateAsync(value);
      if (!active.current || session !== adminSessionGeneration()) return false;
      pending.current = null;
      await client.invalidateQueries({ queryKey: ROOT });
      await client.invalidateQueries({ queryKey: ["vtv-private", "publication", "draft"] });
      setReviewSaves(count => count + 1);
      return true;
    } catch (error) {
      if (!active.current || session !== adminSessionGeneration()) return false;
      if (error instanceof Error && error.message === "REVISION_CONFLICT") { pending.current = null; await client.invalidateQueries({ queryKey: ROOT }); }
      else if (error instanceof Error && (error.message === "UNAVAILABLE" || error.message === "RATE_LIMITED")) setCanRetry(true);
      else pending.current = null;
      return false;
    }
  }, [client, mutation]);
  const retryReview = React.useCallback(() => { if (pending.current) void save(pending.current.input, true); }, [save]);
  const discardReview = () => { pending.current = null; setCanRetry(false); mutation.reset(); };
  const discardRights = () => { pendingRights.current = null; setCanRetryRights(false); rightsMutation.reset(); };
  const saveSelection = React.useCallback(async (input: SelectAnswerInput, retry: boolean): Promise<void> => {
    const session = adminSessionGeneration();
    try {
      const value = retry && pendingSelection.current ? pendingSelection.current : { input, idempotencyKey: crypto.randomUUID() };
      pendingSelection.current = value; setCanRetrySelection(false);
      await selectionMutation.mutateAsync(value);
      if (!active.current || session !== adminSessionGeneration()) return;
      pendingSelection.current = null;
      await client.invalidateQueries({ queryKey: ROOT });
      await client.invalidateQueries({ queryKey: ["vtv-private", "publication", "draft"] });
    } catch (error) {
      if (!active.current || session !== adminSessionGeneration()) return;
      if (error instanceof Error && error.message === "REVISION_CONFLICT") { pendingSelection.current = null; await client.invalidateQueries({ queryKey: ROOT }); }
      else if (error instanceof Error && (error.message === "UNAVAILABLE" || error.message === "RATE_LIMITED")) setCanRetrySelection(true);
      else pendingSelection.current = null;
    }
  }, [client, selectionMutation]);
  const retrySelection = React.useCallback(() => { if (pendingSelection.current) void saveSelection(pendingSelection.current.input, true); }, [saveSelection]);
  const setSelectedEntry = React.useCallback((id: string | null) => { if (pending.current || pendingRights.current || pendingSelection.current) return; setHistoryCursor(null); setCollisionCursor(null); setSelected(id); }, []);
  const applyFilters = React.useCallback((next: Filters) => { if (pending.current || pendingRights.current || pendingSelection.current) return; setCursor(null); setSelectedEntry(null); setFilters(next); }, [setSelectedEntry]);
  const latestDetail = (id: string) => client.getQueryData<Detail>([...ROOT, "detail", id]);
  return { collision: collisionQuery.data ?? null, collisionLoading: collisionQuery.isFetching, collisionError: collisionQuery.isError, collisionCursor, setCollisionCursor, retrySelection, saveSelection, canRetrySelection, selectionError: selectionMutation.isError, filters, applyFilters, cursor, setCursor, selected, setSelectedEntry, list: listQuery.data ?? null, listLoading: listQuery.isFetching, listError: listQuery.isError, retryList: listQuery.refetch, detail: detailQuery.data ?? null, latestDetail, detailLoading: detailQuery.isFetching, detailError: detailQuery.isError, retryDetail: detailQuery.refetch, history: historyCursor ? historyQuery.data ?? null : detailQuery.data?.history ?? null, setHistoryCursor, historyError: historyQuery.isError, save, retryReview, reviewSaves, rightsSaves, discardReview, saving: mutation.isPending || rightsMutation.isPending || selectionMutation.isPending, saveError: mutation.isError || rightsMutation.isError, canRetry, saveRights, canRetryRights, discardRights };
}
