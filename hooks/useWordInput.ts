"use client";

import * as React from "react";
import type { InputProps } from "@/components/atoms/Input";
import type { PlayableRound } from "@/types/vua-tieng-viet";
import { commitInput, guessEligibility, keyboardKnowledge, submitGuess, type PlayerErrorCode } from "@/lib/vua-tieng-viet/player-engine";
import { normalizeSpelling } from "@/lib/vua-tieng-viet/dictionary-contract";

type Options = {
  state: PlayableRound | null;
  current: React.RefObject<PlayableRound | null>;
  loading: React.RefObject<boolean>;
  conflict: React.RefObject<boolean>;
  busy: boolean;
  dialogOpen: boolean;
  restoredRoundId: string | null;
  replace: (next: PlayableRound) => void;
  setError: (error: PlayerErrorCode | null) => void;
};

type RejectedInput = { kind: "character" | "length"; position: number; letter: string };

function rejectedCharacter(raw: string, level: number): RejectedInput | null {
  let position = 0;
  for (const letter of raw.slice(0, 121).normalize("NFC").match(/\P{Mark}\p{Mark}*|\p{Mark}+/gu) ?? []) {
    if (letter === " ") continue;
    position++;
    try { normalizeSpelling(letter); }
    catch { return { kind: "character", position, letter: letter.trim().slice(0, 12) || "␣" }; }
    if (position > level) return { kind: "length", position, letter };
  }
  return null;
}

const touchInputQuery = "(hover: none) and (pointer: coarse)";
const usesTouchInput = () => window.matchMedia(touchInputQuery).matches;
const desktopServerSnapshot = () => false;

function subscribeToTouchInput(onChange: () => void) {
  const media = window.matchMedia(touchInputQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** Adapts browser input and focus to the same committed game transitions. */
export function useWordInput({ state, current, loading, conflict, busy, dialogOpen, restoredRoundId, replace, setError }: Options) {
  const touchInput = React.useSyncExternalStore(subscribeToTouchInput, usesTouchInput, desktopServerSnapshot);
  const [draft,setDraft] = React.useState<string | null>(null);
  const [rejected, setRejected] = React.useState<RejectedInput | null>(null);
  const composing = React.useRef(false), suppressEnter = React.useRef(false), processing = React.useRef(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const actionRef = React.useRef<HTMLButtonElement>(null);
  const firstKeyRef = React.useRef<HTMLButtonElement>(null);
  const openerRef = React.useRef<HTMLButtonElement | null>(null);
  const reset = React.useCallback(() => { setDraft(null); setRejected(null); composing.current = false; suppressEnter.current = false; },[]);
  const roundId = state?.round.id, guessCount = state?.round.guesses.length;
  const terminal = state?.round.status === "lost" || state?.round.status === "won";
  const focusedTransition = React.useRef<string | null>(null);
  const focusInput = () => {
    const element = inputRef.current;
    if (usesTouchInput() || !element || element.disabled) return false;
    element.focus({ preventScroll: true });
    return true;
  };
  React.useEffect(() => {
    if (!roundId || busy || dialogOpen) return;
    const transition = `${roundId}:${guessCount}`;
    if (focusedTransition.current === transition) return;
    focusedTransition.current = transition;
    if (roundId === restoredRoundId) return;
    const active = document.activeElement;
    if (active && active !== document.body && active !== inputRef.current && active !== actionRef.current) return;
    if (terminal) actionRef.current?.focus({ preventScroll: true });
    else if (!usesTouchInput()) inputRef.current?.focus({ preventScroll: true });
  },[roundId,guessCount,terminal,busy,dialogOpen,restoredRoundId]);
  const edit = (raw: string) => {
    if (loading.current || processing.current || conflict.current || !current.current) return;
    if (composing.current) { setDraft(raw); return; }
    const result = commitInput(current.current,raw);
    setRejected(result.error === "INVALID_INPUT" ? rejectedCharacter(raw, current.current.round.level) : null);
    const next = result.state === current.current ? result.state : { ...result.state, round: { ...result.state.round, updatedAt: new Date(Math.max(Date.now(),Date.parse(result.state.round.updatedAt))).toISOString() } };
    replace(next); setDraft(null); setError(result.error);
  };
  const submit = () => {
    if (!current.current || loading.current || processing.current || conflict.current || composing.current || current.current.round.status !== "playing" || dialogOpen) return;
    focusInput();
    processing.current = true;
    try {
      setRejected(null);
      const timestamp = new Date(Math.max(Date.now(),Date.parse(current.current.round.updatedAt))).toISOString();
      const result = submitGuess(current.current,current.current.round.revision,() => ({ id: crypto.randomUUID(), timestamp }));
      if (result.error === "INCOMPLETE") return;
      replace(result.state); setError(result.error);
    } finally { processing.current = false; }
  };
  const virtualKey = (letter: string, restoreFocus = true) => {
    if (!current.current || composing.current) return;
    const raw = current.current.round.input.normalize("NFC");
    edit(letter === "Backspace" ? Array.from(raw.trimEnd()).slice(0,-1).join("") : raw + letter);
    if (restoreFocus) focusInput();
  };
  const compositionStart = () => { if (current.current?.round.status === "playing") { composing.current = true; suppressEnter.current = false; setDraft(current.current.round.input); } };
  const caretToEnd = (element: HTMLInputElement) => {
    if (!composing.current && element.selectionStart === element.selectionEnd) element.setSelectionRange(element.value.length,element.value.length);
  };
  const disabled = !state || state.round.status !== "playing" || busy;
  const field: InputProps = {
    ref: inputRef,
    value: draft ?? state?.round.input ?? "",
    disabled,
    inputMode: touchInput ? "none" : undefined,
    tabIndex: touchInput ? -1 : undefined,
    onChange: event => {
      if ("isComposing" in event.nativeEvent && event.nativeEvent.isComposing === true && !composing.current) compositionStart();
      edit(event.currentTarget.value);
    },
    onPaste: event => {
      if (composing.current || !current.current || loading.current) return;
      event.preventDefault();
      const element = event.currentTarget, raw = current.current.round.input;
      const start = element.selectionStart ?? raw.length, end = element.selectionEnd ?? raw.length;
      const text = event.clipboardData.getData("text/plain");
      edit(start === end ? raw + text : raw.slice(0,start) + text + raw.slice(end));
    },
    onClick: event => caretToEnd(event.currentTarget),
    onCompositionStart: compositionStart,
    onCompositionEnd: event => { composing.current = false; edit(event.currentTarget.value); },
    onKeyDown: event => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || composing.current) {
        if (event.key === "Enter") suppressEnter.current = true;
        return;
      }
      if (event.key.length === 1) caretToEnd(event.currentTarget);
      if (event.key !== "Enter" && event.key !== "Backspace") return;
      event.preventDefault();
      if (event.key === "Enter") { if (!suppressEnter.current && !event.repeat) submit(); }
      else virtualKey("Backspace");
    },
    onKeyUp: event => { if (event.key === "Enter") suppressEnter.current = false; },
  };
  let letters: string[] = [];
  try { letters = Array.from(normalizeSpelling(state?.round.input ?? "").normalized); } catch { /* Committed state is validated; composition is displayed separately. */ }
  const eligibility = guessEligibility(state,draft !== null,busy || dialogOpen);
  const knowledge = React.useMemo(() => keyboardKnowledge(state?.round.guesses ?? [], state?.round.rules.accuracy, state?.round.initialAbsentLetters),[state?.round.guesses, state?.round.rules.accuracy, state?.round.initialAbsentLetters]);
  return {
    field, letters, rejected, draft, eligibility, submit, actionRef, reset, focusInput,
    keyboard: { knowledge, disabled: disabled || draft !== null, onKey: virtualKey, focusInput, firstKeyRef },
    rememberOpener: (element: HTMLButtonElement) => { openerRef.current = element; },
    restoreFocus: () => openerRef.current?.focus({ preventScroll: true }),
    restoreConflictFocus: () => {
      if (inputRef.current && !inputRef.current.disabled) {
        if (usesTouchInput()) firstKeyRef.current?.focus({ preventScroll: true });
        else focusInput();
      } else actionRef.current?.focus({ preventScroll: true });
    },
  };
}
