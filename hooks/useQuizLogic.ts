"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { quizLeaderboardQueryKey, useQuizQuestions, useQuizSession, useQuizSessionRealtime, useSubmitQuizAnswer } from "@/hooks/useQuizSystem";
import { useSyncedCountdown } from "@/hooks/useSyncedCountdown";
import { supabase } from "@/lib/supabase";
import { isQuizId, parseQuizRankings, QuizRequestError, type QuizIdentity, type QuizSubmitRequest } from "@/lib/quiz/client";

export function useQuizLeaderboard(sessionId: string | null, limit = 10) {
  return useQuery({ queryKey: quizLeaderboardQueryKey(sessionId, limit), enabled: isQuizId(sessionId), refetchInterval: 1000, queryFn: async ({ signal }) => {
    if (!isQuizId(sessionId)) throw new Error("INVALID_INPUT");
    const { data, error } = await supabase.from("quiz_leaderboard").select("id,session_id,display_name,score").eq("session_id", sessionId)
      .order("score", { ascending: false }).order("id").limit(Math.max(1, Math.min(100, limit))).abortSignal(signal);
    if (error) throw error;
    return parseQuizRankings(data);
  } });
}

export function useQuizLogic({ sessionId, identity }: { sessionId: string; identity: QuizIdentity }) {
  useQuizSessionRealtime(sessionId);
  const sessionQuery = useQuizSession(sessionId);
  const session = sessionQuery.data;
  const questionId = session?.status === "active" ? session.current_question_id : null;
  const questionsQuery = useQuizQuestions(sessionId, questionId);
  const activeQuestion = questionsQuery.data?.find(question => question.id === questionId && question.session_id === sessionId) ?? null;
  const countdown = useSyncedCountdown({ startedAt: session?.current_question_started_at, durationSeconds: activeQuestion?.time_limit_seconds ?? 0 });
  const submission = useSubmitQuizAnswer();
  const [selection, setSelection] = React.useState<{ questionId: string; ids: string[] } | null>(null);
  const [pending, setPending] = React.useState<QuizSubmitRequest | null>(null);
  const [localError, setLocalError] = React.useState(false);
  const busy = React.useRef(false);
  const controller = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => { controller.current?.abort(); }, []);
  const selectedOptionIds = selection?.questionId === questionId ? selection.ids : [];
  const answered = Boolean(submission.data && submission.data.question_id === questionId);
  const isLive = session?.status === "active";
  const retryable = submission.error instanceof QuizRequestError && submission.error.retryable;
  const error = localError ? "UNAVAILABLE" : submission.error instanceof QuizRequestError ? submission.error.code : submission.isError ? "UNAVAILABLE" : null;
  const canSubmit = Boolean(activeQuestion && isLive && !sessionQuery.isError && !questionsQuery.isError && !answered && !pending && selectedOptionIds.length > 0 && !countdown.isExpired && !submission.isPending);
  const selectOption = (optionId: string) => {
    if (!activeQuestion || !isLive || answered || pending || busy.current || countdown.isExpired || !activeQuestion.options.some(option => option.id === optionId)) return;
    const ids = activeQuestion.type !== "multiple_choice" ? [optionId] : selectedOptionIds.includes(optionId) ? selectedOptionIds.filter(id => id !== optionId) : [...selectedOptionIds, optionId];
    setSelection({ questionId: activeQuestion.id, ids });
  };
  const execute = (request: QuizSubmitRequest) => {
    if (busy.current) return;
    busy.current = true;
    controller.current = new AbortController();
    setLocalError(false);
    submission.mutate({ request, signal: controller.current.signal }, { onSuccess: () => { setPending(null); }, onSettled: () => { busy.current = false; } });
  };
  const submitSelectedAnswer = () => {
    if (!canSubmit || !activeQuestion || busy.current) return;
    try {
      const request: QuizSubmitRequest = { operation: "submit", sessionId, questionId: activeQuestion.id, requestId: crypto.randomUUID(), selectedOptionIds: [...selectedOptionIds], credential: identity.credential };
      setPending(request);
      execute(request);
    } catch { setLocalError(true); }
  };
  // An uncertain attempt must stay retryable after expiry or host progression.
  const retry = () => { if (pending && retryable && !busy.current) execute(pending); };
  const terminalForPreviousQuestion = pending && pending.questionId !== questionId && error && !retryable;
  const continueToQuestion = () => {
    if (!terminalForPreviousQuestion || busy.current) return;
    setPending(null); submission.reset(); setLocalError(false);
  };
  return { session, activeQuestion, countdown, selectedOptionIds, isLive, canSubmit, selectOption, submitSelectedAnswer, retry,
    pending: Boolean(pending), canRetry: Boolean(pending && retryable && !submission.isPending), receipt: submission.data, error,
    isSubmitting: submission.isPending, isLoading: sessionQuery.isLoading || (Boolean(questionId) && questionsQuery.isLoading),
    readError: sessionQuery.isError || questionsQuery.isError, refresh: () => { void sessionQuery.refetch(); if (questionId) void questionsQuery.refetch(); },
    continueToQuestion, canContinue: Boolean(terminalForPreviousQuestion), answered };
}
