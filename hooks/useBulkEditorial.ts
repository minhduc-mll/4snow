"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminSessionGeneration } from "@/hooks/useAdminAuth";
import { BULK_BATCH_SIZE, parseBulkPage, parseBulkReceipt, parseBulkRequest, type BulkApply, type BulkReceipt, type BulkCreate, type BulkDecision, type BulkPage, type BulkTarget } from "@/lib/vua-tieng-viet/bulk-review-contract";
import { canonicalJson } from "@/lib/vua-tieng-viet/dictionary-contract";
import { PrivateRequestError } from "@/lib/vua-tieng-viet/private-transport";
import { requestPrivateDictionary } from "@/lib/vua-tieng-viet/private-request";

const STORAGE_KEY = "vtv-editorial-bulk-v1";
const ROOT = ["vtv-private", "editorial", "bulk"];
type PendingBatch = { input: BulkApply; idempotencyKey: string };
type Resume = { selectionId: string; pending: PendingBatch | null };

function readResume(): Resume | null {
  try {
    const selectionId = sessionStorage.getItem(STORAGE_KEY);
    if (!selectionId) return null;
    parseBulkRequest({ operation: "bulk-page", requestId: selectionId, input: { selectionId, offset: 0 } });
    return { selectionId, pending: null };
  } catch { return null; }
}

function waitForRetry(signal: AbortSignal, milliseconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, milliseconds);
    signal.addEventListener("abort", abort, { once: true });
  });
}

async function batchIdentity(input: Omit<BulkApply, "batchId">): Promise<{ batchId: string; idempotencyKey: string }> {
  // Reconstruct the same identities after refresh without retaining the decision in browser storage.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(input)));
  const hex = Array.from(new Uint8Array(digest), (part) => part.toString(16).padStart(2, "0")).join("");
  const uuid = (value: string) => [value.slice(0, 8), value.slice(8, 12), value.slice(12, 16), value.slice(16, 20), value.slice(20, 32)].join("-");
  return { batchId: uuid(hex.slice(0, 32)), idempotencyKey: uuid(hex.slice(32)) };
}

export function useBulkEditorial(onUnauthorized: () => void, enabled: boolean) {
  const client = useQueryClient();
  const [targets, setTargets] = React.useState<BulkTarget[]>([]);
  const [resume, setResume] = React.useState(readResume);
  const [offset, setOffset] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [waitingForQuota, setWaitingForQuota] = React.useState(false);
  const [storageError, setStorageError] = React.useState(false);
  const controller = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => controller.current?.abort(), []);
  const persist = (next: Resume | null) => {
    setResume(next);
    try {
      if (next) sessionStorage.setItem(STORAGE_KEY, next.selectionId);
      else sessionStorage.removeItem(STORAGE_KEY);
      setStorageError(false);
    } catch { setStorageError(true); }
  };
  const call = React.useCallback((operation: string, input: unknown, signal: AbortSignal, idempotencyKey?: string) => requestPrivateDictionary({ operation, requestId: crypto.randomUUID(), input, ...(idempotencyKey ? { idempotencyKey } : {}) }, signal, onUnauthorized), [onUnauthorized]);
  const pageQuery = useQuery<BulkPage>({
    queryKey: [...ROOT, resume?.selectionId, offset],
    enabled: enabled && !!resume,
    gcTime: 0, retry: false, placeholderData: (previous) => previous,
    queryFn: async ({ signal }) => parseBulkPage(await call("bulk-page", { selectionId: resume?.selectionId, offset }, signal)),
  });
  const createMutation = useMutation({
    mutationKey: [...ROOT, "create"], retry: false, gcTime: 0,
    mutationFn: async (input: BulkCreate) => {
      controller.current = new AbortController();
      return parseBulkPage(await call("bulk-create", input, controller.current.signal));
    },
  });
  const applyMutation = useMutation({
    mutationKey: [...ROOT, "apply"], retry: false, gcTime: 0,
    mutationFn: async ({ selection, decision }: { selection: BulkPage; decision: BulkDecision }): Promise<void> => {
      const session = adminSessionGeneration();
      const abort = new AbortController();
      controller.current = abort;
      let checkpoint = selection.checkpoint;
      let draftRevision = selection.draftRevision;
      let pending = resume?.pending ?? null;
      const send = async (operation: string, input: unknown, key?: string): Promise<unknown> => {
        try { return await call(operation, input, abort.signal, key); }
        catch (error) {
          if (!(error instanceof PrivateRequestError) || error.kind !== "RATE_LIMITED") throw error;
          setWaitingForQuota(true);
          try { await waitForRetry(abort.signal, (error.retryAfterSeconds ?? 60) * 1000 + 100); }
          finally { if (!abort.signal.aborted) setWaitingForQuota(false); }
          abort.signal.throwIfAborted();
          return call(operation, input, abort.signal, key);
        }
      };
      const recover = async (): Promise<boolean> => {
        const latest = parseBulkPage(await send("bulk-page", { selectionId: selection.selectionId, offset: 0 }));
        if (abort.signal.aborted || session !== adminSessionGeneration()) return false;
        if (latest.selectionHash !== selection.selectionHash || latest.checkpoint <= checkpoint || !latest.decision || canonicalJson(latest.decision) !== canonicalJson(decision)) return false;
        checkpoint = latest.checkpoint;
        draftRevision = latest.draftRevision;
        pending = null;
        persist({ selectionId: selection.selectionId, pending: null });
        client.setQueryData([...ROOT, selection.selectionId, 0], latest);
        return true;
      };
      while (pending || checkpoint < selection.count) {
        if (abort.signal.aborted || session !== adminSessionGeneration()) return;
        if (!pending) {
          const page = parseBulkPage(await send("bulk-page", { selectionId: selection.selectionId, offset: checkpoint }));
          if (page.checkpoint !== checkpoint || page.draftRevision !== draftRevision || page.selectionHash !== selection.selectionHash) {
            if (await recover()) continue;
            throw new Error("REVISION_CONFLICT");
          }
          const input = { ...decision, selectionId: page.selectionId, selectionHash: page.selectionHash, offset: checkpoint, expectedDraftRevision: draftRevision, targets: page.items.map(({ entryId, expectedEntryRevision }) => ({ entryId, expectedEntryRevision })) };
          const { batchId, idempotencyKey } = await batchIdentity(input);
          if (abort.signal.aborted || session !== adminSessionGeneration()) return;
          pending = { input: { ...input, batchId }, idempotencyKey };
          parseBulkRequest({ operation: "bulk-apply", requestId: pending.input.batchId, ...pending });
          persist({ selectionId: selection.selectionId, pending });
        }
        let receipt: BulkReceipt;
        try { receipt = parseBulkReceipt(await send("bulk-apply", pending.input, pending.idempotencyKey)); }
        catch (error) {
          if (error instanceof PrivateRequestError && error.kind === "REVISION_CONFLICT" && await recover()) continue;
          throw error;
        }
        if (abort.signal.aborted || session !== adminSessionGeneration()) return;
        if (receipt.batchId !== pending.input.batchId || receipt.checkpoint !== pending.input.offset + pending.input.targets.length) throw new Error("INVALID_RESPONSE");
        checkpoint = receipt.checkpoint;
        draftRevision = receipt.draftRevision;
        pending = null;
        persist({ selectionId: selection.selectionId, pending: null });
        client.setQueriesData<BulkPage>({ queryKey: [...ROOT, selection.selectionId] }, (page) => {
          if (!page || page.checkpoint >= checkpoint) return page;
          const totals = { ...page.totals };
          const byId = new Map(receipt.items.map((item) => {
            totals[item.status]++;
            return [item.entryId, item];
          }));
          return { ...page, checkpoint, draftRevision, decision, totals, items: page.items.map((item) => ({ ...item, result: byId.get(item.entryId) ?? item.result })) };
        });
      }
    },
  });
  const toggle = (target: BulkTarget) => setTargets((current) => current.some((item) => item.entryId === target.entryId) ? current.filter((item) => item.entryId !== target.entryId) : current.length < 500 ? [...current, target] : current);
  const includePage = (items: BulkTarget[]) => setTargets((current) => {
    const additions = items.filter((item) => !current.some((target) => target.entryId === item.entryId));
    return [...current, ...additions].slice(0, 500);
  });
  const start = async (input: BulkCreate) => {
    const session = adminSessionGeneration();
    setError(null);
    try {
      const selection = await createMutation.mutateAsync(input);
      if (session !== adminSessionGeneration()) return;
      setOffset(0);
      client.setQueryData([...ROOT, selection.selectionId, 0], selection);
      persist({ selectionId: selection.selectionId, pending: null });
    } catch (error) { if (session === adminSessionGeneration()) setError(error instanceof Error ? error.message : "UNAVAILABLE"); }
  };
  const apply = async (decision: BulkDecision): Promise<boolean> => {
    if (!pageQuery.data || pageQuery.isFetching || pageQuery.isPlaceholderData || applyMutation.isPending) return false;
    const session = adminSessionGeneration();
    setError(null);
    try {
      const { category, answerEligible, rationale, exclusionChecks } = decision;
      await applyMutation.mutateAsync({ selection: pageQuery.data, decision: { category, answerEligible, rationale, exclusionChecks } });
      return session === adminSessionGeneration();
    } catch (error) {
      if (session === adminSessionGeneration()) setError(error instanceof Error ? error.message : "UNAVAILABLE");
      return false;
    }
    finally {
      if (session === adminSessionGeneration()) await Promise.all([
        client.invalidateQueries({ queryKey: ["vtv-private", "editorial"] }),
        client.invalidateQueries({ queryKey: ["vtv-private", "publication", "draft"] }),
      ]);
    }
  };
  const clear = () => {
    persist(null);
    setTargets([]);
    setError(null);
    setOffset(0);
  };
  const page = pageQuery.data ?? null;
  const canPage = page !== null && !pageQuery.isFetching && !applyMutation.isPending && page.offset === offset;
  const canPrevious = canPage && page.offset > 0;
  const canNext = canPage && page.offset + BULK_BATCH_SIZE < page.count;
  return { targets, toggle, includePage, clear, start, apply, page, canNext, canPrevious, waitingForQuota, next: () => { if (canNext) setOffset(page.offset + BULK_BATCH_SIZE); }, previous: () => { if (canPrevious) setOffset(page.offset - BULK_BATCH_SIZE); }, loading: createMutation.isPending || pageQuery.isFetching, saving: applyMutation.isPending, error: error ?? (pageQuery.isError ? "UNAVAILABLE" : null), pageError: pageQuery.isError, retryPage: pageQuery.refetch, storageError, resume };
}
