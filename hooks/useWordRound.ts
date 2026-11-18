"use client";

import * as React from "react";
import type { PlayableRound, WordLevel } from "@/types/vua-tieng-viet";
import { PlayerError, startRound, type PlayerErrorCode } from "@/lib/vua-tieng-viet/player-engine";
import { useWordInput } from "@/hooks/useWordInput";
import { usePublishedDictionary } from "@/hooks/usePublishedDictionary";
import { createRoundStorage, ROUND_SAVE_KEY, type RoundRecovery } from "@/lib/vua-tieng-viet/round-save";

export function useWordRound() {
  const load = usePublishedDictionary();
  const [state,setState] = React.useState<PlayableRound | null>(null);
  const current = React.useRef<PlayableRound | null>(null);
  const [storage] = React.useState(() => createRoundStorage(() => window.localStorage));
  const [recovery,setRecovery] = React.useState<RoundRecovery["kind"] | "loading">("loading");
  const [storageWarning,setStorageWarning] = React.useState(false);
  const [conflict,setConflict] = React.useState(false);
  const conflictRef = React.useRef(false), operation = React.useRef(0);
  const [resolutionBusy,setResolutionBusy] = React.useState(false);
  const resolving = React.useRef(false);
  const [resolutionError,setResolutionError] = React.useState<RoundRecovery["kind"] | null>(null);
  const [level,setLevel] = React.useState<WordLevel>(3);
  const [busy,setBusy] = React.useState(false);
  const loading = React.useRef(false);
  const [error,setError] = React.useState<PlayerErrorCode | null>(null);
  const [pendingLevel,setPendingLevel] = React.useState<WordLevel | null>(null);
  const [helpOpen,setHelpOpen] = React.useState(false);
  const controller = React.useRef<AbortController | null>(null);
  const active = React.useRef(true);
  const input = useWordInput({ state, current, loading, conflict: conflictRef, busy: busy || recovery === "loading" || conflict, conflicted: conflict, dialogOpen: pendingLevel !== null || helpOpen, replace, setError });
  const resetInput = input.reset;
  const showConflict = React.useCallback(() => {
    storage.pause();
    conflictRef.current = true; operation.current++; controller.current?.abort();
    loading.current = false; setBusy(false);
    setConflict(true); setPendingLevel(null); setHelpOpen(false); resetInput();
  },[storage,resetInput]);
  React.useEffect(() => { active.current = true; return () => { active.current = false; controller.current?.abort(); }; },[]);
  React.useEffect(() => {
    // Read after hydration; no remote release is needed to resume historical inputs.
    const result = storage.read();
    queueMicrotask(() => {
      if (!active.current) return;
      setRecovery(result.kind);
      if (result.kind === "restored") { current.current = result.state; setState(result.state); setLevel(result.state.round.level); }
      if (result.kind === "unavailable") setStorageWarning(true);
    });
  },[storage]);
  React.useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key !== null && event.key !== ROUND_SAVE_KEY) return;
      try { if (event.storageArea && event.storageArea !== window.localStorage) return; }
      catch { setStorageWarning(true); showConflict(); return; }
      const result = storage.observe();
      if (result !== "unchanged") { showConflict(); if (result === "unavailable") setStorageWarning(true); }
    };
    window.addEventListener("storage",changed);
    return () => window.removeEventListener("storage",changed);
  },[storage,showConflict]);
  const recoveryBlocked = recovery === "loading" || recovery === "invalid" || recovery === "incompatible";
  function replace(next: PlayableRound) {
    if (next === current.current) return;
    current.current = next; setState(next);
    void storage.write(next).then(result => {
      if (!active.current) return;
      if (result === "conflict") showConflict();
      if (result === "unavailable") setStorageWarning(true);
    });
  }
  const begin = async (nextLevel: WordLevel) => {
    if (loading.current || recoveryBlocked || conflictRef.current) return;
    const token = operation.current;
    loading.current = true; setBusy(true); setError(null);
    try {
      controller.current = new AbortController();
      const release = await load(controller.current.signal);
      if (!active.current || token !== operation.current || conflictRef.current) return;
      const previousId = current.current?.round.level === nextLevel ? current.current.answer.id : undefined;
      const next = startRound(release,nextLevel,previousId,() => {
        const value = new Uint32Array(1); crypto.getRandomValues(value);
        const number = value[0];
        if (number === undefined) throw new PlayerError("RANDOM_FAILED");
        return number;
      },() => ({ id: crypto.randomUUID(), timestamp: new Date().toISOString() }));
      const written = await storage.write(next,true);
      if (!active.current || token !== operation.current || conflictRef.current) return;
      if (written === "conflict") { showConflict(); return; }
      if (written === "superseded") return;
      if (written === "unavailable") setStorageWarning(true);
      current.current = next; setState(next); setLevel(nextLevel); resetInput();
    } catch (failure) { if (active.current && token === operation.current) setError(failure instanceof PlayerError ? failure.code : "LOAD_FAILED"); }
    finally { if (token === operation.current) { loading.current = false; if (active.current) setBusy(false); } }
  };
  const requestStart = (nextLevel: WordLevel, event?: React.MouseEvent<HTMLButtonElement>) => {
    if (event) input.rememberOpener(event.currentTarget);
    if (loading.current || conflictRef.current) return;
    if (current.current?.round.status === "playing") setPendingLevel(nextLevel);
    else void begin(nextLevel);
  };
  const chooseLevel = (nextLevel: WordLevel, event?: React.MouseEvent<HTMLButtonElement>) => {
    if (loading.current || conflictRef.current) return;
    if (current.current?.round.status === "playing") requestStart(nextLevel,event);
    else { setLevel(nextLevel); setError(null); }
  };
  const resetSave = async () => {
    const result = await storage.reset();
    if (!active.current) return;
    if (result === "saved") { setRecovery("empty"); setStorageWarning(false); }
    else if (result === "conflict") showConflict();
    else if (result === "unavailable") setStorageWarning(true);
  };
  const resolveConflict = async (choice: "load" | "keep") => {
    if (resolving.current || !conflictRef.current || (choice === "keep" && !current.current)) return;
    resolving.current = true; setResolutionBusy(true); setResolutionError(null);
    const result = choice === "keep" && current.current ? await storage.keep(current.current) : await storage.loadSaved();
    if (active.current) {
      if (result.kind === "restored" || result.kind === "empty") {
        const next = result.kind === "restored" ? result.state : null;
        current.current = next; setState(next); if (next) setLevel(next.round.level);
        setRecovery(result.kind); setError(null); resetInput();
        conflictRef.current = false; setConflict(false);
      } else if (result.kind !== "superseded") {
        setResolutionError(result.kind); if (result.kind === "unavailable") setStorageWarning(true);
      }
      setResolutionBusy(false);
    }
    resolving.current = false;
  };
  return { state, level, busy: busy || recovery === "loading" || conflict, conflict, resolutionBusy, resolutionError, resolveConflict, recovery, recoveryBlocked, storageWarning, resetSave, error, pendingLevel, helpOpen, setHelpOpen, setPendingLevel, input, chooseLevel, requestStart, openHelp: (event: React.MouseEvent<HTMLButtonElement>) => { input.rememberOpener(event.currentTarget); setHelpOpen(true); }, confirm: () => { if (pendingLevel !== null) { const next = pendingLevel; setPendingLevel(null); void begin(next); } } };
}
