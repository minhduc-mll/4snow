"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminSessionGeneration } from "@/hooks/useAdminAuth";
import { BULK_BATCH_SIZE, parseBulkPage, parseBulkReceipt, parseBulkRequest, type BulkApply, type BulkCreate, type BulkDecision, type BulkPage, type BulkTarget } from "@/lib/vua-tieng-viet/bulk-review-contract";
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

export function useBulkEditorial(onUnauthorized: () => void, enabled: boolean) {
  const client = useQueryClient();
  const [targets, setTargets] = React.useState<BulkTarget[]>([]);
  const [resume, setResume] = React.useState(readResume);
  const [offset, setOffset] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
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
      while (pending || checkpoint < selection.count) {
        if (abort.signal.aborted || session !== adminSessionGeneration()) return;
        if (!pending) {
          const page = parseBulkPage(await call("bulk-page", { selectionId: selection.selectionId, offset: checkpoint }, abort.signal));
          if (page.checkpoint !== checkpoint || page.draftRevision !== draftRevision || page.selectionHash !== selection.selectionHash) throw new Error("REVISION_CONFLICT");
          pending = {
            input: { ...decision, selectionId: page.selectionId, selectionHash: page.selectionHash, offset: checkpoint, expectedDraftRevision: draftRevision, batchId: crypto.randomUUID(), targets: page.items.map(({ entryId, expectedEntryRevision }) => ({ entryId, expectedEntryRevision })) },
            idempotencyKey: crypto.randomUUID(),
          };
          parseBulkRequest({ operation: "bulk-apply", requestId: pending.input.batchId, ...pending });
          persist({ selectionId: selection.selectionId, pending });
        }
        const receipt = parseBulkReceipt(await call("bulk-apply", pending.input, abort.signal, pending.idempotencyKey));
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
  const apply = async (decision: BulkDecision) => {
    if (!pageQuery.data) return;
    const session = adminSessionGeneration();
    setError(null);
    try {
      await applyMutation.mutateAsync({ selection: pageQuery.data, decision });
    } catch (error) { if (session === adminSessionGeneration()) setError(error instanceof Error ? error.message : "UNAVAILABLE"); }
    finally { if (session === adminSessionGeneration()) await client.invalidateQueries({ queryKey: ["vtv-private", "editorial"] }); }
  };
  const clear = () => {
    persist(null);
    setTargets([]);
    setError(null);
    setOffset(0);
  };
  return { targets, toggle, includePage, clear, start, apply, page: pageQuery.data ?? null, next: () => setOffset((current) => current + BULK_BATCH_SIZE), previous: () => setOffset((current) => Math.max(0, current - BULK_BATCH_SIZE)), loading: createMutation.isPending || pageQuery.isFetching, saving: applyMutation.isPending, error: error ?? (pageQuery.isError ? "UNAVAILABLE" : null), storageError, resume };
}
