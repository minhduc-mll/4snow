"use client";

import { useEffect, useMemo, useState } from "react";

export interface SyncedCountdownInput {
  startedAt: string | null | undefined;
  durationSeconds: number;
  tickMs?: number;
}

export interface SyncedCountdownState {
  remainingMs: number;
  remainingSeconds: number;
  progress: number;
  isExpired: boolean;
}

function getRemainingMs(startedAt: string | null | undefined, durationMs: number): number {
  if (!startedAt || durationMs <= 0) {
    return 0;
  }

  const startedAtMs = Date.parse(startedAt);

  if (Number.isNaN(startedAtMs)) {
    return 0;
  }

  return Math.max(0, startedAtMs + durationMs - Date.now());
}

export function useSyncedCountdown({
  startedAt,
  durationSeconds,
  tickMs = 250,
}: SyncedCountdownInput): SyncedCountdownState {
  const durationMs = Math.max(0, durationSeconds * 1_000);
  const [remainingMs, setRemainingMs] = useState(() =>
    getRemainingMs(startedAt, durationMs),
  );

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setRemainingMs(getRemainingMs(startedAt, durationMs));
    }, tickMs);

    return () => window.clearInterval(intervalId);
  }, [durationMs, startedAt, tickMs]);

  return useMemo(() => {
    const progress = durationMs > 0 ? remainingMs / durationMs : 0;

    return {
      remainingMs,
      remainingSeconds: Math.ceil(remainingMs / 1_000),
      progress: Math.max(0, Math.min(1, progress)),
      isExpired: remainingMs <= 0,
    };
  }, [durationMs, remainingMs]);
}
