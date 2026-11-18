"use client";

import * as React from "react";
import { requestPrivateDictionary } from "@/lib/vua-tieng-viet/private-request";
import { PrivateRequestError } from "@/lib/vua-tieng-viet/private-transport";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminSessionGeneration } from "@/hooks/useAdminAuth";
import type { ImportPreflight } from "@/lib/vua-tieng-viet/import-preflight";
import type { ImportStartMutation, ImportApplyMutation, ImportFinalizeMutation } from "@/lib/vua-tieng-viet/import-contract";

type Receipt = { chunkIndex: number; canonicalHash: string; stagedCount: number; createdCount: number; noOpCount: number; countsProvisional: true };
type ImportSession = { importId: string; expectedChunks: number; status: string; draftRevision: string; receipts: Receipt[]; artifactId: string; artifactRevision: string; createdCount: number | null; noOpCount: number | null };
type ImportAction = Pick<ImportStartMutation, "operation" | "input"> | Pick<ImportApplyMutation, "operation" | "input"> | Pick<ImportFinalizeMutation, "operation" | "input">;

type StartResponse = { importId: string; expectedChunks: number; status: "staging" | "finalized" | "failed"; draftRevision: string; receipts: Receipt[] };
type FinalizeResponse = { status: "finalized"; draftRevision: string; createdCount: number; noOpCount: number };
const SESSION_KEY = ["vtv-private", "import-session"];

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function receipt(value: unknown): Receipt {
  if (!record(value) || typeof value.chunkIndex !== "number" || !Number.isInteger(value.chunkIndex) || value.chunkIndex < 0 || value.chunkIndex >= 100 || typeof value.canonicalHash !== "string" || !/^[0-9a-f]{64}$/.test(value.canonicalHash) || typeof value.stagedCount !== "number" || !Number.isInteger(value.stagedCount) || value.stagedCount < 0 || value.stagedCount > 200 || typeof value.createdCount !== "number" || !Number.isInteger(value.createdCount) || value.createdCount < 0 || typeof value.noOpCount !== "number" || !Number.isInteger(value.noOpCount) || value.noOpCount < 0 || value.createdCount + value.noOpCount !== value.stagedCount || value.countsProvisional !== true) throw new Error("Invalid receipt");
  return { chunkIndex: value.chunkIndex, canonicalHash: value.canonicalHash, stagedCount: value.stagedCount, createdCount: value.createdCount, noOpCount: value.noOpCount, countsProvisional: true };
}
function startResponse(value: Record<string, unknown>): StartResponse {
  if (typeof value.importId !== "string" || !/^[0-9a-f-]{36}$/i.test(value.importId) || typeof value.expectedChunks !== "number" || !Number.isInteger(value.expectedChunks) || value.expectedChunks < 1 || value.expectedChunks > 100 || (value.status !== "staging" && value.status !== "finalized" && value.status !== "failed") || typeof value.draftRevision !== "string" || !/^(0|[1-9][0-9]{0,18})$/.test(value.draftRevision) || !Array.isArray(value.receipts) || value.receipts.length > value.expectedChunks) throw new Error("UNAVAILABLE");
  return { importId: value.importId, expectedChunks: value.expectedChunks, status: value.status, draftRevision: value.draftRevision, receipts: value.receipts.map(receipt) };
}
function finalizeResponse(value: Record<string, unknown>): FinalizeResponse {
  if (value.status !== "finalized" || typeof value.draftRevision !== "string" || !/^(0|[1-9][0-9]{0,18})$/.test(value.draftRevision) || typeof value.createdCount !== "number" || !Number.isInteger(value.createdCount) || value.createdCount < 0 || value.createdCount > 20000 || typeof value.noOpCount !== "number" || !Number.isInteger(value.noOpCount) || value.noOpCount < 0 || value.noOpCount > 20000) throw new Error("UNAVAILABLE");
  return { status: "finalized", draftRevision: value.draftRevision, createdCount: value.createdCount, noOpCount: value.noOpCount };
}


function importError(error: unknown): string {
  if (!(error instanceof PrivateRequestError)) return error instanceof Error ? error.message : "UNAVAILABLE";
  if (error.kind !== "IMPORT_CONFLICT" || !record(error.details)) return error.kind;
  const { reason, location } = error.details;
  const allowed = ["ARTIFACT_MISMATCH", "CHUNK_HASH_MISMATCH", "IMPORT_NOT_STAGING", "ARTIFACT_LIMIT", "MISSING_CHUNKS", "SOURCE_METADATA_MISMATCH", "DUPLICATE_IDENTITY", "SOURCE_REFERENCE", "CANDIDATE_CONTENT_MISMATCH"];
  if (typeof reason !== "string" || !allowed.includes(reason)) return error.kind;
  const part = record(location) && typeof location.chunkIndex === "number" ? ` (part ${location.chunkIndex + 1}${typeof location.entryIndex === "number" ? `, entry ${location.entryIndex + 1}` : ""})` : "";
  return `${reason}${part}`;
}

function applyKey(hash: string): string {
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

function waitForQuota(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { window.clearTimeout(timer); reject(signal.reason); };
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, 60_000);
    signal.addEventListener("abort", abort, { once: true });
  });
}

export function useDictionaryImport(onUnauthorized: () => void) {
  const queryClient = useQueryClient();
  const controller = React.useRef<AbortController | null>(null);
  const [waitingForQuota, setWaitingForQuota] = React.useState(false);
  const sessionQuery = useQuery<ImportSession>({ queryKey: SESSION_KEY, queryFn: async () => { throw new Error("Start an import first"); }, enabled: false, gcTime: 0 });
  React.useEffect(() => () => { controller.current?.abort(); }, []);

  const mutation = useMutation({
    mutationKey: ["vtv-private", "import"], retry: false, gcTime: 0,
    mutationFn: async ({ preflight, signal }: { preflight: ImportPreflight; signal: AbortSignal }) => {
      const generation = adminSessionGeneration();
      const assertSession = () => {
        signal.throwIfAborted();
        if (generation !== adminSessionGeneration()) throw new PrivateRequestError("CANCELLED");
      };
      const request = async (action: ImportAction, idempotencyKey: string = crypto.randomUUID()): Promise<Record<string, unknown>> => {
        let waited = false;
        for (;;) {
          assertSession();
          try {
            const data = await requestPrivateDictionary({ ...action, idempotencyKey, requestId: crypto.randomUUID() }, signal, onUnauthorized);
            assertSession();
            if (!record(data)) throw new PrivateRequestError("UNAVAILABLE");
            return data;
          } catch (error) {
            if (waited || !(error instanceof PrivateRequestError) || error.kind !== "RATE_LIMITED") throw error;
            waited = true;
            setWaitingForQuota(true);
            try { await waitForQuota(signal); }
            finally { if (!signal.aborted) setWaitingForQuota(false); }
          }
        }
      };
      const { artifactId, artifactRevision, chunks } = preflight;
      const start = startResponse(await request({ operation: "import-start", input: { artifactId, artifactRevision, chunkCount: chunks.length } }));
      const receipts = new Map<number, Receipt>();
      if (start.expectedChunks !== chunks.length) throw new Error("ARTIFACT_MISMATCH");
      for (const item of start.receipts) {
        if (receipts.has(item.chunkIndex) || chunks[item.chunkIndex]?.canonicalHash !== item.canonicalHash) throw new Error("CHUNK_HASH_MISMATCH");
        receipts.set(item.chunkIndex, item);
      }
      const session: ImportSession = { ...start, artifactId, artifactRevision, createdCount: null, noOpCount: null };
      queryClient.setQueryData(SESSION_KEY, session);
      if (start.status === "finalized") {
        if (receipts.size !== chunks.length) throw new Error("MISSING_CHUNKS");
        void queryClient.invalidateQueries({ queryKey: ["vtv-private", "editorial"] });
        return;
      }
      if (start.status !== "staging") throw new Error("IMPORT_NOT_STAGING");
      for (const [index, chunk] of chunks.entries()) {
        if (receipts.has(index)) continue;
        const item = receipt(await request({ operation: "import-apply", input: { importId: start.importId, document: chunk.document, canonicalHash: chunk.canonicalHash } }, applyKey(chunk.canonicalHash)));
        if (item.chunkIndex !== index || item.canonicalHash !== chunk.canonicalHash) throw new Error("CHUNK_HASH_MISMATCH");
        receipts.set(index, item);
        queryClient.setQueryData<ImportSession>(SESSION_KEY, { ...session, receipts: [...receipts.values()] });
      }
      const finalized = finalizeResponse(await request({ operation: "import-finalize", input: { importId: start.importId, expectedDraftRevision: start.draftRevision } }));
      queryClient.setQueryData<ImportSession>(SESSION_KEY, { ...session, ...finalized, receipts: [...receipts.values()] });
      void queryClient.invalidateQueries({ queryKey: ["vtv-private", "editorial"] });
    },
  });
  const { mutate, reset } = mutation;
  const run = (preflight: ImportPreflight) => {
    if (controller.current || preflight.issues.some((issue) => issue.blocking) || !preflight.chunks.length) return;
    const active = new AbortController();
    controller.current = active;
    mutate({ preflight, signal: active.signal }, { onSettled: () => { controller.current = null; } });
  };
  const clear = () => {
    reset();
    queryClient.removeQueries({ queryKey: SESSION_KEY, exact: true });
    queryClient.setQueryData(SESSION_KEY, null);
  };
  return { session: sessionQuery.data ?? null, loading: mutation.isPending, errorCode: mutation.error ? importError(mutation.error) : null, waitingForQuota, run, clear };
}
