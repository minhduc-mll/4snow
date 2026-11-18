"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { requestPrivateDictionary } from "@/lib/vua-tieng-viet/private-request";
import { previewImport, type PreviewResult } from "@/lib/vua-tieng-viet/preview";
import { parseStrictJson } from "@/lib/vua-tieng-viet/strict-json";

type PreviewJob = { requestId: string; input: unknown };

function isPreviewResult(value: unknown): value is PreviewResult {
  if (typeof value !== "object" || value === null || !("valid" in value) || typeof value.valid !== "boolean" || !("entryCount" in value) || typeof value.entryCount !== "number" || !("collisionCount" in value) || typeof value.collisionCount !== "number" || !("duplicateCount" in value) || typeof value.duplicateCount !== "number" || !("conflictCount" in value) || typeof value.conflictCount !== "number" || !("canonicalHash" in value) || !(value.canonicalHash === null || typeof value.canonicalHash === "string") || !("errorsTruncated" in value) || typeof value.errorsTruncated !== "boolean" || !("errors" in value) || !Array.isArray(value.errors) || value.errors.length > 100) return false;
  return value.errors.every((error: unknown) => typeof error === "object" && error !== null && "field" in error && typeof error.field === "string" && "message" in error && typeof error.message === "string");
}

export function useDictionaryPreview(onUnauthorized: () => void) {
  const queryClient = useQueryClient();
  const [local, setLocal] = React.useState<PreviewResult | null>(null);
  const [job, setJob] = React.useState<PreviewJob | null>(null);
  const [fileError, setFileError] = React.useState(false);
  const generation = React.useRef(0);
  React.useEffect(() => () => { generation.current++; }, []);
  const query = useQuery({
    queryKey: ["vtv-private", "preview", job?.requestId],
    enabled: job !== null,
    retry: false,
    gcTime: 0,
    queryFn: async ({ signal }): Promise<PreviewResult> => {
      if (!job) throw new Error("No preview selected");
      const data = await requestPrivateDictionary({ operation: "import-preview", requestId: job.requestId, input: job.input }, signal, onUnauthorized);
      if (!isPreviewResult(data)) throw new Error("Invalid preview response");
      return data;
    },
  });
  const selectFile = React.useCallback(async (file: File | null): Promise<void> => {
    const selected = ++generation.current;
    setLocal(null); setJob(null); setFileError(false);
    await queryClient.cancelQueries({ queryKey: ["vtv-private", "preview"] });
    if (selected !== generation.current) return;
    queryClient.removeQueries({ queryKey: ["vtv-private", "preview"] });
    if (!file) return;
    if (file.size > 512 * 1024) { setFileError(true); return; }
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      const result = await previewImport(text);
      if (selected !== generation.current) return;
      setLocal(result);
      try { setJob({ requestId: crypto.randomUUID(), input: parseStrictJson(text) }); } catch { /* Invalid JSON is reported by the browser preview. */ }
    } catch { if (selected === generation.current) setFileError(true); }
  }, [queryClient]);
  return { local, remote: query.data ?? null, input: job?.input ?? null, loading: query.isFetching, remoteError: query.isError, fileError, selectFile, retry: query.refetch };
}
