"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isRecord } from "@/lib/vua-tieng-viet/publication-contract";
import { requestPrivateDictionary } from "@/lib/vua-tieng-viet/private-request";
import { commitInput, startRound, submitGuess, type PlayerErrorCode } from "@/lib/vua-tieng-viet/player-engine";
import { validateReleaseRow } from "@/lib/vua-tieng-viet/public-release";
import type { PlayableRound, WordLevel } from "@/types/vua-tieng-viet";

function metadata() {
  return { id: crypto.randomUUID(), timestamp: new Date().toISOString() };
}

export function usePublicationPreviewRound(buildId: string, contentHash: string, onUnauthorized: () => void) {
  const [round, setRound] = useState<PlayableRound | null>(null);
  const current = useRef<PlayableRound | null>(null);
  const [error, setError] = useState<PlayerErrorCode | null>(null);
  const build = useQuery({
    queryKey: ["vtv-private", "publication", "game", buildId, contentHash],
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async ({ signal }) => {
      try {
        const row = await requestPrivateDictionary({
          operation: "publication-game",
          requestId: crypto.randomUUID(),
          input: { buildId, contentHash },
        }, signal, onUnauthorized);
        if (!isRecord(row) || typeof row.id !== "string" || row.payload_sha256 !== contentHash) throw new Error("Invalid build");
        return await validateReleaseRow([row], row.id);
      } catch {
        throw new Error("Preview unavailable");
      }
    },
  });

  const update = (next: PlayableRound) => {
    current.current = next;
    setRound(next);
  };

  const start = (level: WordLevel) => {
    if (!build.data) return;
    try {
      const previous = current.current?.round.level === level ? current.current.answer.id : undefined;
      const next = startRound(build.data, level, previous, () => crypto.getRandomValues(new Uint32Array(1))[0], metadata);
      update(next);
      setError(null);
    } catch {
      setError("RANDOM_FAILED");
    }
  };

  const submit = (input: string) => {
    const state = current.current;
    if (!state || state.round.status !== "playing") return false;
    const entered = commitInput(state, input);
    if (entered.error) {
      setError(entered.error);
      return false;
    }
    const submitted = submitGuess(entered.state, entered.state.round.revision, metadata);
    setError(submitted.error);
    if (submitted.error) return false;
    update(submitted.state);
    return true;
  };

  return { build, round, error, start, submit };
}
