"use client";

import * as React from "react";
import { requestPrivateDictionary } from "@/lib/vua-tieng-viet/private-request";
import type { PrivateRequest } from "@/lib/vua-tieng-viet/private-transport";
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminSessionGeneration } from "@/hooks/useAdminAuth";
import { isRecord, isRevision, type PublicationRequest } from "@/lib/vua-tieng-viet/publication-contract";
import { parsePublicationPreview, parsePublishResult, parseDraftConfiguration, type DraftConfiguration, type PublicationPreview, type PublishResult } from "@/lib/vua-tieng-viet/publication-response";

const ROOT = ["vtv-private", "publication"];
type Result = { operation: "configuration"; data: DraftConfiguration } | { operation: "publication-preview"; data: PublicationPreview } | { operation: "publish"; data: PublishResult };
export function useDictionaryPublication(onUnauthorized: () => void) {
  const client = useQueryClient();
  const preparing = React.useRef(false);
  const pending = React.useRef<PublicationRequest | null>(null);
  const controller = React.useRef<AbortController | null>(null);
  const active = React.useRef(true);
  const [canRetry, setCanRetry] = React.useState(false);
  const [localError, setLocalError] = React.useState(false);
  React.useEffect(() => { active.current = true; return () => { active.current = false; controller.current?.abort(); pending.current = null; }; }, []);
  const call = React.useCallback((body: PrivateRequest, signal: AbortSignal): Promise<unknown> => requestPrivateDictionary(body, signal, onUnauthorized), [onUnauthorized]);
  const draft = useQuery({ queryKey: [...ROOT, "draft"], retry: false, gcTime: 0, enabled: process.env.NEXT_PUBLIC_VTV_IMPORT_ENABLED === "true", queryFn: async ({ signal }) => {
      const result = await call({ operation: "list", requestId: crypto.randomUUID(), input: { filters: { sourceId: null, level: null, review: null, hasDefinition: null, collisionsOnly: false }, cursor: null, limit: 1 } }, signal);
      if (!isRecord(result) || !isRevision(result.draftRevision)) throw new Error("UNAVAILABLE");
      return result.draftRevision;
  } });
  const configuration = useQuery<DraftConfiguration>({ queryKey: [...ROOT,"configuration"], queryFn: skipToken, gcTime: 0 });
  const preview = useQuery<PublicationPreview>({ queryKey: [...ROOT, "preview"], queryFn: skipToken, gcTime: 0 });
  const published = useQuery<PublishResult>({ queryKey: [...ROOT, "published"], queryFn: skipToken, gcTime: 0 });
  const mutation = useMutation({ mutationKey: ROOT, retry: false, gcTime: 0, mutationFn: async (request: PublicationRequest): Promise<Result> => {
    controller.current = new AbortController();
    const result = await call(request, controller.current.signal);
    try { return request.operation === "configuration" ? { operation: request.operation, data: parseDraftConfiguration(result) } : request.operation === "publication-preview" ? { operation: request.operation, data: parsePublicationPreview(result) } : { operation: request.operation, data: parsePublishResult(result) }; }
    catch { throw new Error("UNAVAILABLE"); }
  } });
  const execute = async (request: PublicationRequest) => {
    if (!active.current) return;
    const session = adminSessionGeneration();
    pending.current = request; setCanRetry(false); setLocalError(false);
    try {
      const result = await mutation.mutateAsync(request);
      if (!active.current || session !== adminSessionGeneration()) return;
      pending.current = null;
      if (result.operation === "publication-preview") {
        client.setQueryData([...ROOT,"preview"],result.data);
        client.setQueryData<DraftConfiguration>([...ROOT,"configuration"],{ draftRevision: result.data.draftRevision, configuration: { configurationId: result.data.configuration.configurationId, attemptLimit: result.data.configuration.attemptLimit, normalizerVersion: "vi-nfc-v2", levels: [3,5,7,9] } });
      } else if (result.operation === "configuration") {
        client.setQueryData([...ROOT,"configuration"],result.data);
        client.removeQueries({ queryKey: [...ROOT,"preview"] });
        client.removeQueries({ queryKey: [...ROOT,"published"] });
      }
      else { client.setQueryData([...ROOT, "published"], result.data); client.removeQueries({ queryKey: [...ROOT, "preview"] }); client.removeQueries({ queryKey: [...ROOT,"configuration"] }); }
      await client.invalidateQueries({ queryKey: ["vtv-private", "editorial"] });
      await client.invalidateQueries({ queryKey: [...ROOT, "draft"] });
      if (result.operation === "publish") await client.invalidateQueries({ queryKey: ["vtv-public"] });
    } catch (error) {
      if (!active.current || session !== adminSessionGeneration()) return;
      if (error instanceof Error && (error.message === "UNAVAILABLE" || error.message === "RATE_LIMITED")) setCanRetry(true);
      else {
        pending.current = null;
        if (error instanceof Error && error.message === "REVISION_CONFLICT") { client.removeQueries({ queryKey: [...ROOT, "preview"] }); client.removeQueries({ queryKey: [...ROOT,"configuration"] }); await client.invalidateQueries({ queryKey: [...ROOT, "draft"] }); }
      }
    }
  };
  const refresh = async () => {
    if (pending.current || mutation.isPending || preparing.current) return;
    preparing.current = true;
    const session = adminSessionGeneration();
    try {
      const fresh = await draft.refetch();
      if (!active.current || session !== adminSessionGeneration() || !fresh.data || fresh.isError) return;
      client.removeQueries({ queryKey: [...ROOT, "published"] });
      await execute({ operation: "publication-preview", requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID(), input: { expectedDraftRevision: fresh.data } });
    } catch { if (active.current) setLocalError(true); }
    finally { preparing.current = false; }
  };
  const publish = () => {
    if (!preview.data?.valid || pending.current || mutation.isPending || preparing.current || draft.isFetching) return;
    try { void execute({ operation: "publish", requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID(), input: { buildId: preview.data.buildId, expectedDraftRevision: preview.data.draftRevision, expectedCurrentReleaseId: preview.data.expectedCurrentReleaseId } }); }
    catch { setLocalError(true); }
  };
  const configure = (attemptLimit: number) => {
    if (!configuration.data || pending.current || mutation.isPending || preparing.current || draft.isFetching) return;
    try { void execute({ operation: "configuration", requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID(), input: { expectedDraftRevision: configuration.data.draftRevision, attemptLimit } }); }
    catch { setLocalError(true); }
  };
  return { configuration: configuration.data, configure, preview: preview.data, published: published.data, refresh, publish, retry: () => { if (pending.current && !mutation.isPending) void execute(pending.current); }, canRetry, busy: mutation.isPending || draft.isFetching, error: localError || mutation.isError || draft.isError, stale: mutation.error?.message === "REVISION_CONFLICT" };
}
