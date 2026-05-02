"use client";

import { useMemo } from "react";
import { REALTIME_POSTGRES_CHANGES_LISTEN_EVENT } from "@supabase/supabase-js";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useRealtime } from "@/hooks/useRealtime";
import type {
  QuizQuestion,
  QuizSession,
  QuizSubmission,
  QuizSubmissionInsert,
} from "@/types/database";

export const quizSessionQueryKey = (sessionId: string): QueryKey => [
  "quiz-session",
  sessionId,
];

export const quizQuestionsQueryKey = (sessionId: string): QueryKey => [
  "quiz-questions",
  sessionId,
];

export const quizSubmissionsQueryKey = (sessionId: string): QueryKey => [
  "quiz-submissions",
  sessionId,
];

export interface SubmitQuizAnswerInput {
  sessionId: string;
  question: QuizQuestion;
  participantId: string | null;
  selectedOptionIds: string[];
  timeRemainingMs: number;
}

export interface SubmitQuizAnswerResult {
  submission: QuizSubmission;
  isCorrect: boolean;
  score: number;
}

function areAnswersCorrect(selectedOptionIds: string[], correctOptionIds: string[]): boolean {
  if (selectedOptionIds.length !== correctOptionIds.length) {
    return false;
  }

  const selected = new Set(selectedOptionIds);
  return correctOptionIds.every((optionId) => selected.has(optionId));
}

function calculateQuizScore(
  basePoints: number,
  timeRemainingMs: number,
  totalTimeSeconds: number,
  isCorrect: boolean,
): number {
  if (!isCorrect || totalTimeSeconds <= 0) {
    return 0;
  }

  const ratio = Math.max(0, Math.min(1, timeRemainingMs / (totalTimeSeconds * 1_000)));
  return Math.round(basePoints * ratio);
}

function isQuizSessionRecord(value: unknown): value is QuizSession {
  return typeof value === "object" && value !== null && "id" in value;
}

export function useQuizSession(sessionId: string | null) {
  return useQuery({
    queryKey: quizSessionQueryKey(sessionId ?? "idle"),
    enabled: Boolean(sessionId),
    queryFn: async (): Promise<QuizSession> => {
      if (!sessionId) {
        throw new Error("Missing quiz session id.");
      }

      const { data, error } = await supabase
        .from("quiz_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

      if (error) {
        throw error;
      }

      return data;
    },
  });
}

export function useQuizQuestions(sessionId: string | null) {
  return useQuery({
    queryKey: quizQuestionsQueryKey(sessionId ?? "idle"),
    enabled: Boolean(sessionId),
    queryFn: async (): Promise<QuizQuestion[]> => {
      if (!sessionId) {
        throw new Error("Missing quiz session id.");
      }

      const { data, error } = await supabase
        .from("quiz_questions")
        .select("*")
        .eq("session_id", sessionId)
        .order("order_index", { ascending: true });

      if (error) {
        throw error;
      }

      return data;
    },
  });
}

export function useQuizSessionRealtime(sessionId: string | null): void {
  const queryClient = useQueryClient();

  const realtimeOptions = useMemo(
    () => ({
      type: "postgres" as const,
      channelName: `quiz-session:${sessionId ?? "idle"}`,
      table: "quiz_sessions",
      event: REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.UPDATE,
      filter: sessionId ? `id=eq.${sessionId}` : undefined,
      enabled: Boolean(sessionId),
      onChange: (payload: { new: unknown }) => {
        if (!sessionId) {
          return;
        }

        if (isQuizSessionRecord(payload.new)) {
          queryClient.setQueryData(quizSessionQueryKey(sessionId), payload.new);
        }

        void queryClient.invalidateQueries({
          queryKey: quizSessionQueryKey(sessionId),
        });
      },
    }),
    [queryClient, sessionId],
  );

  useRealtime<QuizSession>(realtimeOptions);
}

export function useSubmitQuizAnswer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: SubmitQuizAnswerInput,
    ): Promise<SubmitQuizAnswerResult> => {
      const isCorrect = areAnswersCorrect(
        input.selectedOptionIds,
        input.question.correct_option_ids,
      );
      const score = calculateQuizScore(
        input.question.base_points,
        input.timeRemainingMs,
        input.question.time_limit_seconds,
        isCorrect,
      );

      const submission: QuizSubmissionInsert = {
        session_id: input.sessionId,
        question_id: input.question.id,
        participant_id: input.participantId,
        selected_option_ids: input.selectedOptionIds,
        is_correct: isCorrect,
        time_remaining_ms: Math.max(0, Math.round(input.timeRemainingMs)),
        score,
        submitted_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("quiz_submissions")
        .insert(submission)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      return {
        submission: data,
        isCorrect,
        score,
      };
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({
        queryKey: quizSubmissionsQueryKey(result.submission.session_id),
      });
    },
  });
}
