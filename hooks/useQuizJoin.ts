"use client";

import * as React from "react";
import { useJoinQuiz, useQuizSession } from "@/hooks/useQuizSystem";
import { QuizRequestError } from "@/lib/quiz/client";

export function useQuizJoin(sessionId: string) {
  const session = useQuizSession(sessionId);
  const join = useJoinQuiz();
  const [displayName, setDisplayName] = React.useState("");
  const controller = React.useRef<AbortController | null>(null);
  const busy = React.useRef(false);
  React.useEffect(() => () => { controller.current?.abort(); }, []);
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy.current || !displayName.trim() || displayName.length > 80 || session.data?.status !== "lobby") return;
    busy.current = true;
    controller.current = new AbortController();
    join.mutate({ sessionId, displayName: displayName.trim(), signal: controller.current.signal }, { onSettled: () => { busy.current = false; } });
  };
  return { session: session.data, identity: join.data, displayName, setDisplayName, submit,
    canJoin: session.data?.status === "lobby" && !session.isError && !join.isPending && displayName.trim().length > 0,
    pending: join.isPending, readError: session.isError, refresh: () => { void session.refetch(); },
    error: join.error instanceof QuizRequestError ? join.error.code : join.isError ? "UNAVAILABLE" : null };
}
