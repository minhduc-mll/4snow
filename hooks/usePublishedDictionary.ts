"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { loadCurrentRelease, parseCurrentRelease, readPublicJson, validateReleaseRow } from "@/lib/vua-tieng-viet/public-release";
import { PlayerError } from "@/lib/vua-tieng-viet/player-engine";

export function usePublishedDictionary() {
  const client = useQueryClient();
  return React.useCallback(async (roundSignal: AbortSignal) => {
    if (!navigator.onLine) throw new PlayerError("OFFLINE");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new PlayerError("LOAD_FAILED");
    const get = async (table: string, parameters: Record<string,string>, signal: AbortSignal, maxBytes: number) => {
      try {
        const response = await fetch(`${url}/rest/v1/${table}?${new URLSearchParams(parameters)}`, { cache: "no-store", signal: AbortSignal.any([signal,roundSignal,AbortSignal.timeout(15000)]), headers: { apikey: key, Authorization: `Bearer ${key}` } });
        if (!response.ok) throw new PlayerError("LOAD_FAILED");
        return await readPublicJson(response,maxBytes);
      } catch (error) { throw error instanceof PlayerError ? error : new PlayerError(navigator.onLine ? "LOAD_FAILED" : "OFFLINE"); }
    };
    return loadCurrentRelease({
      pointer: () => client.fetchQuery({ queryKey: ["vtv-public","current"], staleTime: 0, retry: false, networkMode: "always", queryFn: async ({ signal }) => parseCurrentRelease(await get("vtv_current_release",{ select: "release_id,pointer_revision::text", id: "eq.1", limit: "1" },signal,16*1024)) }),
      // PostgREST's JSONB whitespace/row envelope is separate from the strict
      // 2 MiB canonical public payload cap enforced by validateReleaseRow.
      release: (id) => client.fetchQuery({ queryKey: ["vtv-public","release",id], staleTime: 0, retry: false, networkMode: "always", queryFn: async ({ signal }) => validateReleaseRow(await get("vtv_releases",{ select: "id,schema_version,normalizer_version,configuration_id,attempt_limit,published_at,public_payload,payload_sha256", id: `eq.${id}`, limit: "1" },signal,3*1024*1024),id) }),
    });
  },[client]);
}
