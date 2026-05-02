"use client";

import * as React from "react";
import { useQuery, type QueryKey } from "@tanstack/react-query";

import { useRealtime } from "@/hooks/useRealtime";
import {
  quizSubmissionsQueryKey,
  useQuizQuestions,
  useQuizSession,
  useQuizSessionRealtime,
  useSubmitQuizAnswer,
} from "@/hooks/useQuizSystem";
import { useSyncedCountdown, type SyncedCountdownState } from "@/hooks/useSyncedCountdown";
import { supabase } from "@/lib/supabase";
import { useQuizStore } from "@/stores/useQuizStore";
import type {
  Participant,
  QuizQuestion,
  QuizSession,
  QuizSessionStatus,
} from "@/types/database";

export const quizControlEventName = "quiz-control";

export const quizLeaderboardQueryKey = (
  sessionId: string | null,
  limit: number,
): QueryKey => ["quiz-leaderboard", sessionId ?? "idle", limit];

export interface QuizControlBroadcastPayload extends Record<string, unknown> {
  sessionId: string;
  status: QuizSessionStatus;
  questionId: string | null;
  questionIndex: number;
  startedAt: string | null;
  durationSeconds: number;
  sentAt: string;
}

export interface CalculateQuizPointsInput {
  basePoints: number;
  timeRemainingMs: number;
  totalTimeSeconds: number;
  isCorrect: boolean;
}

export interface BroadcastQuestionStartInput {
  status: QuizSessionStatus;
  questionId: string | null;
  questionIndex: number;
  durationSeconds: number;
  startedAt?: string | null;
}

export interface UseQuizLogicOptions {
  sessionId: string | null;
  participantId?: string | null;
}

export interface UseQuizLogicResult {
  session: QuizSession | undefined;
  questions: QuizQuestion[];
  activeQuestion: QuizQuestion | null;
  countdown: SyncedCountdownState;
  selectedOptionIds: string[];
  answerStatus: string;
  isLoading: boolean;
  isLive: boolean;
  canSubmit: boolean;
  isSubmitting: boolean;
  selectOption: (optionId: string) => void;
  submitSelectedAnswer: () => void;
  broadcastQuestionStart: (input: BroadcastQuestionStartInput) => Promise<boolean>;
}

function getActiveQuestion(
  session: QuizSession | undefined,
  questions: QuizQuestion[],
  activeQuestionId: string | null,
): QuizQuestion | null {
  if (questions.length === 0) {
    return null;
  }

  const questionByStoreId = questions.find(
    (question) => question.id === activeQuestionId,
  );

  if (questionByStoreId) {
    return questionByStoreId;
  }

  const questionBySessionId = questions.find(
    (question) => question.id === session?.current_question_id,
  );

  if (questionBySessionId) {
    return questionBySessionId;
  }

  return questions[Math.max(0, session?.question_index ?? 0)] ?? questions[0] ?? null;
}

export function calculateQuizPoints({
  basePoints,
  timeRemainingMs,
  totalTimeSeconds,
  isCorrect,
}: CalculateQuizPointsInput): number {
  if (!isCorrect || totalTimeSeconds <= 0) {
    return 0;
  }

  const ratio = Math.max(0, Math.min(1, timeRemainingMs / (totalTimeSeconds * 1_000)));
  return Math.round(basePoints * ratio);
}

export function useQuizLeaderboard(sessionId: string | null, limit = 10) {
  return useQuery({
    queryKey: quizLeaderboardQueryKey(sessionId, limit),
    enabled: Boolean(sessionId),
    queryFn: async (): Promise<Participant[]> => {
      if (!sessionId) {
        throw new Error("Missing quiz session id.");
      }

      const { data, error } = await supabase
        .from("participants")
        .select("*")
        .eq("session_id", sessionId)
        .order("score", { ascending: false })
        .limit(limit);

      if (error) {
        throw error;
      }

      return data;
    },
  });
}

export function useQuizLogic({
  sessionId,
  participantId = null,
}: UseQuizLogicOptions): UseQuizLogicResult {
  useQuizSessionRealtime(sessionId);

  const sessionQuery = useQuizSession(sessionId);
  const questionsQuery = useQuizQuestions(sessionId);
  const submitAnswer = useSubmitQuizAnswer();

  const activeQuestionId = useQuizStore((state) => state.activeQuestionId);
  const selectedOptionIds = useQuizStore((state) => state.selectedOptionIds);
  const answerStatus = useQuizStore((state) => state.answerStatus);
  const syncedQuestionStartedAt = useQuizStore(
    (state) => state.syncedQuestionStartedAt,
  );
  const syncedQuestionDurationSeconds = useQuizStore(
    (state) => state.syncedQuestionDurationSeconds,
  );
  const setActiveSession = useQuizStore((state) => state.setActiveSession);
  const setActiveQuestion = useQuizStore((state) => state.setActiveQuestion);
  const setActiveStep = useQuizStore((state) => state.setActiveStep);
  const setSelectedOptionIds = useQuizStore((state) => state.setSelectedOptionIds);
  const setAnswerStatus = useQuizStore((state) => state.setAnswerStatus);
  const setSyncedQuestionTimer = useQuizStore(
    (state) => state.setSyncedQuestionTimer,
  );
  const setLocalCountdownSeconds = useQuizStore(
    (state) => state.setLocalCountdownSeconds,
  );

  const session = sessionQuery.data;
  const questions = React.useMemo(
    () => questionsQuery.data ?? [],
    [questionsQuery.data],
  );
  const activeQuestion = React.useMemo(
    () => getActiveQuestion(session, questions, activeQuestionId),
    [activeQuestionId, questions, session],
  );

  const realtimeOptions = React.useMemo(
    () => ({
      type: "broadcast" as const,
      channelName: `quiz-control:${sessionId ?? "idle"}`,
      event: quizControlEventName,
      enabled: Boolean(sessionId),
      onMessage: (payload: QuizControlBroadcastPayload) => {
        if (!sessionId || payload.sessionId !== sessionId) {
          return;
        }

        setActiveSession(payload.sessionId);
        setActiveQuestion(payload.questionId);
        setActiveStep(payload.status === "active" ? "question" : "lobby");
        setSyncedQuestionTimer(payload.startedAt, payload.durationSeconds);
      },
    }),
    [
      sessionId,
      setActiveQuestion,
      setActiveSession,
      setActiveStep,
      setSyncedQuestionTimer,
    ],
  );

  const realtime = useRealtime<QuizSession, QuizControlBroadcastPayload>(
    realtimeOptions,
  );

  const startedAt =
    syncedQuestionStartedAt ??
    session?.current_question_started_at ??
    session?.started_at;
  const durationSeconds =
    syncedQuestionDurationSeconds || activeQuestion?.time_limit_seconds || 0;

  const countdown = useSyncedCountdown({
    startedAt,
    durationSeconds,
  });

  React.useEffect(() => {
    setActiveSession(sessionId);
  }, [sessionId, setActiveSession]);

  React.useEffect(() => {
    setActiveQuestion(activeQuestion?.id ?? null);
  }, [activeQuestion?.id, setActiveQuestion]);

  React.useEffect(() => {
    setActiveStep(session?.status === "active" ? "question" : "lobby");
  }, [session?.status, setActiveStep]);

  React.useEffect(() => {
    if (!activeQuestion) {
      setSyncedQuestionTimer(null, 0);
      return;
    }

    setSyncedQuestionTimer(
      session?.current_question_started_at ?? session?.started_at ?? null,
      activeQuestion.time_limit_seconds,
    );
  }, [
    activeQuestion,
    session?.current_question_started_at,
    session?.started_at,
    setSyncedQuestionTimer,
  ]);

  React.useEffect(() => {
    setLocalCountdownSeconds(countdown.remainingSeconds);
  }, [countdown.remainingSeconds, setLocalCountdownSeconds]);

  const isLive = session?.status === "active";
  const isMultipleChoice = activeQuestion?.type === "multiple_choice";
  const canSubmit =
    Boolean(activeQuestion) &&
    Boolean(sessionId) &&
    isLive &&
    selectedOptionIds.length > 0 &&
    !countdown.isExpired &&
    answerStatus !== "confirmed" &&
    !submitAnswer.isPending;

  const selectOption = React.useCallback(
    (optionId: string): void => {
      if (!activeQuestion || answerStatus === "confirmed") {
        return;
      }

      if (!isMultipleChoice) {
        setSelectedOptionIds([optionId]);
        return;
      }

      const nextSelection = selectedOptionIds.includes(optionId)
        ? selectedOptionIds.filter((selectedId) => selectedId !== optionId)
        : [...selectedOptionIds, optionId];

      setSelectedOptionIds(nextSelection);
    },
    [
      activeQuestion,
      answerStatus,
      isMultipleChoice,
      selectedOptionIds,
      setSelectedOptionIds,
    ],
  );

  const submitSelectedAnswer = React.useCallback((): void => {
    if (!activeQuestion || !sessionId || !canSubmit) {
      return;
    }

    submitAnswer.mutate(
      {
        sessionId,
        question: activeQuestion,
        participantId,
        selectedOptionIds,
        timeRemainingMs: countdown.remainingMs,
      },
      {
        onSuccess: (result) => {
          setAnswerStatus(result.isCorrect ? "confirmed" : "rejected");
        },
        onError: () => setAnswerStatus("rejected"),
      },
    );
  }, [
    activeQuestion,
    canSubmit,
    countdown.remainingMs,
    participantId,
    selectedOptionIds,
    sessionId,
    setAnswerStatus,
    submitAnswer,
  ]);

  const broadcastQuestionStart = React.useCallback(
    async ({
      status,
      questionId,
      questionIndex,
      durationSeconds,
      startedAt: nextStartedAt,
    }: BroadcastQuestionStartInput): Promise<boolean> => {
      if (!sessionId || !realtime.channel) {
        return false;
      }

      const sentAt = new Date().toISOString();
      const payload: QuizControlBroadcastPayload = {
        sessionId,
        status,
        questionId,
        questionIndex,
        startedAt: nextStartedAt ?? sentAt,
        durationSeconds,
        sentAt,
      };

      const response = await realtime.channel.send({
        type: "broadcast",
        event: quizControlEventName,
        payload,
      });

      setActiveQuestion(questionId);
      setActiveStep(status === "active" ? "question" : "lobby");
      setSyncedQuestionTimer(payload.startedAt, payload.durationSeconds);

      return response === "ok";
    },
    [
      realtime.channel,
      sessionId,
      setActiveQuestion,
      setActiveStep,
      setSyncedQuestionTimer,
    ],
  );

  return {
    session,
    questions,
    activeQuestion,
    countdown,
    selectedOptionIds,
    answerStatus,
    isLoading: sessionQuery.isLoading || questionsQuery.isLoading,
    isLive,
    canSubmit,
    isSubmitting: submitAnswer.isPending,
    selectOption,
    submitSelectedAnswer,
    broadcastQuestionStart,
  };
}

export { quizSubmissionsQueryKey };
