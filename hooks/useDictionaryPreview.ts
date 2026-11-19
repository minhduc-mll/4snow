"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { requestPrivateDictionary } from "@/lib/vua-tieng-viet/private-request";
import { importFilesToResume, rememberImportFiles } from "@/lib/vua-tieng-viet/import-selection";
import type { PreviewResult } from "@/lib/vua-tieng-viet/preview";
import { preflightImport, type ImportPreflight } from "@/lib/vua-tieng-viet/import-preflight";

type PreviewJob = { requestId: string; input: unknown };

function isPreviewResult(value: unknown): value is PreviewResult {
  if (typeof value !== "object" || value === null || !("valid" in value) || typeof value.valid !== "boolean" || !("entryCount" in value) || typeof value.entryCount !== "number" || !("collisionCount" in value) || typeof value.collisionCount !== "number" || !("duplicateCount" in value) || typeof value.duplicateCount !== "number" || !("conflictCount" in value) || typeof value.conflictCount !== "number" || !("canonicalHash" in value) || !(value.canonicalHash === null || typeof value.canonicalHash === "string") || !("errorsTruncated" in value) || typeof value.errorsTruncated !== "boolean" || !("errors" in value) || !Array.isArray(value.errors) || value.errors.length > 100) return false;
  return value.errors.every((error: unknown) => typeof error === "object" && error !== null && "field" in error && typeof error.field === "string" && "message" in error && typeof error.message === "string");
}

export function useDictionaryPreview(onUnauthorized: () => void) {
  const [local, setLocal] = React.useState<ImportPreflight | null>(null);
  const [job, setJob] = React.useState<PreviewJob | null>(null);
  const [reading, setReading] = React.useState(false);
  const [fileError, setFileError] = React.useState(false);
  const generation = React.useRef(0);
  const selectedFiles = React.useRef<readonly File[]>([]);
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

  const selectFiles = React.useCallback(async (files: readonly File[]): Promise<void> => {
    const selected = ++generation.current;
    selectedFiles.current = files;
    setLocal(null);
    setJob(null);
    setFileError(false);
    setReading(files.length > 0);
    try {
      if (!files.length) return;
      const result = await preflightImport(files);
      if (selected !== generation.current) return;
      setLocal(result);
      const first = result.chunks[0];
      if (!first || result.issues.some((issue) => issue.blocking)) return;
      const requestId = crypto.randomUUID();
      const bytes = new TextEncoder().encode(JSON.stringify({ operation: "import-preview", requestId, input: first.document })).length;
      if (bytes <= 512 * 1024) setJob({ requestId, input: first.document });
    } catch {
      if (selected === generation.current) setFileError(true);
    } finally {
      if (selected === generation.current) setReading(false);
    }
  }, []);
  React.useEffect(() => {
    const files = importFilesToResume();
    if (files) queueMicrotask(() => void selectFiles(files));
  }, [selectFiles]);
  const retainSelectedFiles = () => rememberImportFiles(selectedFiles.current);
  const retry = () => { void query.refetch(); };
  return { local, remote: query.data ?? null, checkingRemote: job !== null, loading: reading || query.isFetching, remoteError: query.isError, fileError, selectFiles, retainSelectedFiles, retry };
}
