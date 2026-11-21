"use client";

import * as React from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminSessionGeneration } from "@/hooks/useAdminAuth";
import { parseCollisionPage } from "@/lib/vua-tieng-viet/collision-response";
import { normalizeSpelling } from "@/lib/vua-tieng-viet/dictionary-contract";
import { parseEditorialRequest, type CreateCandidateInput } from "@/lib/vua-tieng-viet/editorial-contract";
import { requestPrivateDictionary } from "@/lib/vua-tieng-viet/private-request";
import { isRecord, isUuid } from "@/lib/vua-tieng-viet/publication-contract";

const ROOT = ["vtv-private", "editorial"];
type ManualSource = { id: string; name: string; kind: "kaikki" | "underthesea-resource" | "internal-editorial"; resourceRevision: string; rightsDecision: "cleared" | "unresolved" };
type Pending = { input: CreateCandidateInput; idempotencyKey: string };

function sourcePage(value: unknown): { items: ManualSource[]; nextCursor: string | null } {
  if (!isRecord(value) || !Array.isArray(value.items) || value.items.length > 50 || !(value.nextCursor === null || typeof value.nextCursor === "string")) throw new Error("INVALID_RESPONSE");
  const items = value.items.map((item: unknown): ManualSource => {
    if (!isRecord(item) || !isUuid(item.id) || typeof item.name !== "string" || typeof item.resourceRevision !== "string"
      || (item.kind !== "kaikki" && item.kind !== "underthesea-resource" && item.kind !== "internal-editorial")
      || (item.rightsDecision !== "cleared" && item.rightsDecision !== "unresolved")) throw new Error("INVALID_RESPONSE");
    return { id: item.id, name: item.name, kind: item.kind, resourceRevision: item.resourceRevision, rightsDecision: item.rightsDecision };
  });
  return { items, nextCursor: value.nextCursor };
}

export function useCandidateCreation(draftRevision: string | undefined, onUnauthorized: () => void, onCreated: (id: string) => void) {
  const client = useQueryClient();
  const [original, setOriginal] = React.useState("");
  const [definition, setDefinition] = React.useState("");
  const [sourceId, setSourceId] = React.useState("");
  const [savedSourceId, setSavedSourceId] = React.useState("");
  const [entryUrl, setEntryUrl] = React.useState("");
  const [sourceEntryId, setSourceEntryId] = React.useState("");
  const [sourceSenseId, setSourceSenseId] = React.useState("");
  const [alternate, setAlternate] = React.useState(false);
  const [lookup, setLookup] = React.useState<{ normalized: string; level: number } | null>(null);
  const [invalidSpelling, setInvalidSpelling] = React.useState(false);
  const [invalid, setInvalid] = React.useState(false);
  const [success, setSuccess] = React.useState(false);
  const [createdEntry, setCreatedEntry] = React.useState<string | null>(null);
  const [canRetry, setCanRetry] = React.useState(false);
  const pending = React.useRef<Pending | null>(null);
  const request = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => { request.current?.abort(); }, []);
  const openCreatedEntry = React.useEffectEvent(onCreated);
  React.useEffect(() => { if (createdEntry) openCreatedEntry(createdEntry); }, [createdEntry]);

  const sources = useInfiniteQuery({
    queryKey: [...ROOT, "manual-sources"], initialPageParam: null as string | null,
    retry: false, gcTime: 0,
    queryFn: async ({ signal, pageParam }) => sourcePage(await requestPrivateDictionary(
      { operation: "candidate-sources", requestId: crypto.randomUUID(), input: { cursor: pageParam } }, signal, onUnauthorized,
    )),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const sourceOptions = sources.data?.pages.flatMap(page => page.items) ?? [];
  const selectedSource = sourceOptions.find(source => source.id === sourceId);
  const matches = useInfiniteQuery({
    queryKey: [...ROOT, "manual-collision", lookup], initialPageParam: null as string | null,
    enabled: lookup !== null, retry: false, gcTime: 0,
    queryFn: async ({ signal, pageParam }) => {
      if (!lookup) throw new Error("INVALID_INPUT");
      return parseCollisionPage(await requestPrivateDictionary(
        { operation: "collision", requestId: crypto.randomUUID(), input: { ...lookup, cursor: pageParam, limit: 25 } }, signal, onUnauthorized,
      ));
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const matchingEntries = matches.data?.pages.flatMap(page => page.items) ?? [];
  const spellingChecked = lookup !== null && matches.isSuccess && !matches.isFetching;
  const create = useMutation({
    mutationKey: [...ROOT, "create-candidate"], retry: false, gcTime: 0,
    mutationFn: async ({ input, idempotencyKey }: Pending) => {
      request.current = new AbortController();
      const result = await requestPrivateDictionary({ operation: "create-candidate", requestId: crypto.randomUUID(), idempotencyKey, input }, request.current.signal, onUnauthorized);
      if (!isRecord(result) || !isUuid(result.entryId) || result.review !== "pending") throw new Error("UNAVAILABLE");
      return result.entryId;
    },
  });
  const checkSpelling = () => {
    if (!original.trim()) return;
    try {
      const spelling = normalizeSpelling(original);
      if (![3, 5, 7, 9].includes(spelling.level)) throw new Error("INVALID_INPUT");
      setInvalidSpelling(false);
      setLookup(spelling);
    } catch { setLookup(null); setInvalidSpelling(true); }
  };
  const execute = async (value: Pending, openEntry: boolean): Promise<boolean> => {
    const session = adminSessionGeneration();
    pending.current = value;
    setCanRetry(false);
    try {
      const id = await create.mutateAsync(value);
      if (session !== adminSessionGeneration()) return false;
      pending.current = null;
      setOriginal(""); setDefinition(""); setEntryUrl(""); setSourceEntryId(""); setSourceSenseId("");
      setSavedSourceId(sourceId);
      setAlternate(false); setLookup(null); setSuccess(true);
      if (openEntry) setCreatedEntry(id);
      await client.invalidateQueries({ queryKey: ROOT });
      await client.invalidateQueries({ queryKey: ["vtv-private", "publication", "draft"] });
      return true;
    } catch (error) {
      if (session !== adminSessionGeneration()) return false;
      if (error instanceof Error && (error.message === "UNAVAILABLE" || error.message === "RATE_LIMITED")) setCanRetry(true);
      else {
        pending.current = null;
        if (error instanceof Error && error.message === "SPELLING_EXISTS") {
          checkSpelling();
          await client.invalidateQueries({ queryKey: [...ROOT, "manual-collision"] });
        }
        if (error instanceof Error && error.message === "REVISION_CONFLICT") await client.invalidateQueries({ queryKey: ROOT });
      }
      return false;
    }
  };
  const save = async (openEntry: boolean): Promise<boolean> => {
    if (pending.current) {
      return canRetry && !create.isPending ? execute(pending.current, openEntry) : false;
    }
    if (!selectedSource || !draftRevision || !spellingChecked || (matchingEntries.length && !alternate)) return false;
    const external = selectedSource.kind !== "internal-editorial";
    try {
      const body = parseEditorialRequest({
        operation: "create-candidate", requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID(),
        input: { original, definitionVi: definition.trim() || null, sourceId,
          entryUrl: external ? entryUrl.trim() || null : null, sourceEntryId: external ? sourceEntryId.trim() || null : null,
          sourceSenseId: external ? sourceSenseId.trim() || null : null, allowAlternateMeaning: alternate, expectedDraftRevision: draftRevision },
      });
      if (body.operation !== "create-candidate" || (external && (!body.input.entryUrl || !body.input.sourceEntryId))) throw new Error("INVALID_INPUT");
      setInvalid(false);
      setSuccess(false);
      return await execute(body, openEntry);
    } catch { setInvalid(true); return false; }
  };
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void save(true);
  };
  const dirty = Boolean(original || definition || entryUrl || sourceEntryId || sourceSenseId || alternate || sourceId !== savedSourceId);
  const discard = () => {
    pending.current = null;
    create.reset();
    setCanRetry(false); setInvalid(false); setInvalidSpelling(false); setSuccess(false);
    setOriginal(""); setDefinition(""); setSourceId(savedSourceId); setEntryUrl(""); setSourceEntryId(""); setSourceSenseId("");
    setAlternate(false); setLookup(null);
  };
  return {
    original, setOriginal: (text: string) => { setOriginal(text); setLookup(null); setInvalidSpelling(false); setAlternate(false); setSuccess(false); create.reset(); },
    definition, setDefinition, sourceId, setSourceId, entryUrl, setEntryUrl, sourceEntryId, setSourceEntryId, sourceSenseId, setSourceSenseId,
    alternate, setAlternate, checkSpelling, spellingChecked, invalidSpelling, sources, sourceOptions, selectedSource, matches, matchingEntries, submit, invalid, success,
    error: create.error?.message, busy: create.isPending, canRetry, dirty, discard, save,
    retry: () => void save(true),
  };
}
