"use client";

import * as React from "react";
import { requestPrivateDictionary } from "@/lib/vua-tieng-viet/private-request";
import { PrivateRequestError } from "@/lib/vua-tieng-viet/private-transport";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminSessionGeneration } from "@/hooks/useAdminAuth";
import type { ImportStartMutation, ImportApplyMutation, ImportFinalizeMutation } from "@/lib/vua-tieng-viet/import-contract";

type Receipt = { chunkIndex: number; canonicalHash: string; stagedCount: number; createdCount: number; noOpCount: number; countsProvisional: true };
type ImportSession = { importId: string; expectedChunks: number; status: string; draftRevision: string; receipts: Receipt[]; artifactId: string; artifactRevision: string; createdCount: number | null; noOpCount: number | null };
type ImportAction = Pick<ImportStartMutation, "operation" | "input"> | Pick<ImportApplyMutation, "operation" | "input"> | Pick<ImportFinalizeMutation, "operation" | "input">;
type ImportRequest = ImportAction & { idempotencyKey: string };
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

export function useDictionaryImport(onUnauthorized: () => void) {
  const queryClient = useQueryClient();
  const pending = React.useRef<ImportRequest | null>(null);
  const active = React.useRef(true);
  const controller = React.useRef<AbortController | null>(null);
  const [canRetry, setCanRetry] = React.useState(false);
  const [errorCode, setErrorCode] = React.useState<string | null>(null);
  const sessionQuery = useQuery<ImportSession>({ queryKey: SESSION_KEY, queryFn: async () => { throw new Error("Start an import first"); }, enabled: false, gcTime: 0 });
  React.useEffect(() => { active.current = true; return () => { active.current = false; controller.current?.abort(); pending.current = null; }; }, []);
  const mutation = useMutation({
    mutationKey: ["vtv-private", "import"], retry: false, gcTime: 0,
    mutationFn: async (request: ImportRequest): Promise<Record<string, unknown>> => {
      controller.current = new AbortController();
      try {
        const data = await requestPrivateDictionary({ ...request, requestId: crypto.randomUUID() }, controller.current.signal, onUnauthorized);
        if (!record(data)) throw new Error("UNAVAILABLE");
        return data;
      } catch (error) {
        if (error instanceof PrivateRequestError && error.kind === "IMPORT_CONFLICT" && record(error.details)) {
          const reasons = ["ARTIFACT_MISMATCH", "CHUNK_HASH_MISMATCH", "IMPORT_NOT_STAGING", "ARTIFACT_LIMIT", "MISSING_CHUNKS", "SOURCE_METADATA_MISMATCH", "DUPLICATE_IDENTITY", "SOURCE_REFERENCE", "CANDIDATE_CONTENT_MISMATCH"];
          const reason = typeof error.details.reason === "string" && reasons.includes(error.details.reason) ? error.details.reason : null;
          let location = "";
          const value = error.details.location;
          if (record(value) && typeof value.chunkIndex === "number" && Number.isInteger(value.chunkIndex) && value.chunkIndex >= 0 && value.chunkIndex < 100) {
            location = `:chunk=${value.chunkIndex + 1}`;
            if (typeof value.entryIndex === "number" && Number.isInteger(value.entryIndex) && value.entryIndex >= 0 && value.entryIndex < 200) location += `,entry=${value.entryIndex + 1}`;
          }
          throw new Error(reason ? `${error.kind}:${reason}${location}` : error.kind);
        }
        throw error;
      }
    },
  });
  const execute = React.useCallback(async (request: ImportRequest): Promise<void> => {
    const session = adminSessionGeneration();
    pending.current = request;
    setCanRetry(false); setErrorCode(null);
    try {
      const data = await mutation.mutateAsync(request);
      if (!active.current || session !== adminSessionGeneration()) return;
      if (request.operation === "import-start") {
        const start = startResponse(data);
        queryClient.setQueryData<ImportSession>(SESSION_KEY, { ...start, artifactId: request.input.artifactId, artifactRevision: request.input.artifactRevision, createdCount: null, noOpCount: null });
      } else if (request.operation === "import-apply") {
        const item = receipt(data);
        queryClient.setQueryData<ImportSession>(SESSION_KEY, (previous) => previous ? { ...previous, receipts: [...previous.receipts.filter((prior) => prior.chunkIndex !== item.chunkIndex), item] } : previous);
      } else {
        const { draftRevision, createdCount, noOpCount } = finalizeResponse(data);
        queryClient.setQueryData<ImportSession>(SESSION_KEY, (previous) => previous ? { ...previous, status: "finalized", draftRevision, createdCount, noOpCount } : previous);
      }
      pending.current = null;
    } catch (error) {
      if (!active.current || session !== adminSessionGeneration()) return;
      const code = error instanceof Error ? error.message : "UNAVAILABLE";
      setErrorCode(code);
      setCanRetry(code === "UNAVAILABLE" || code === "RATE_LIMITED");
      if (code !== "UNAVAILABLE" && code !== "RATE_LIMITED") pending.current = null;
    }
  }, [mutation, queryClient]);
  const perform = React.useCallback(async (action: ImportAction): Promise<void> => {
    try { await execute({ ...action, idempotencyKey: crypto.randomUUID() }); }
    catch { setErrorCode("UNAVAILABLE"); }
  }, [execute]);
  const retry = React.useCallback(async (): Promise<void> => { if (pending.current) await execute(pending.current); }, [execute]);
  return { session: sessionQuery.data ?? null, loading: mutation.isPending, errorCode, canRetry, perform, retry };
}
