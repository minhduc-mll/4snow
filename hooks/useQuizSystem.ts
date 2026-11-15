"use client";

import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useRealtime } from "@/hooks/useRealtime";
import { isQuizId, parsePlayerQuestions, parsePlayerSession, parseQuizIdentity, parseQuizReceipt, quizRequest, type QuizSubmitRequest } from "@/lib/quiz/client";

export const quizSessionQueryKey = (id: string) => ["quiz-session", id];
export const quizQuestionsQueryKey = (id: string) => ["quiz-questions", id];
export const quizLeaderboardQueryKey = (id: string | null, limit: number) => ["quiz-leaderboard", id, limit];

export function useQuizSession(sessionId: string | null) {
  return useQuery({ queryKey: quizSessionQueryKey(sessionId ?? "idle"), enabled: isQuizId(sessionId), refetchInterval: 2000, queryFn: async ({ signal }) => {
    if (!sessionId) throw new Error("INVALID_INPUT");
    const { data, error } = await supabase.from("quiz_sessions")
      .select("id,title,status,current_question_id,current_question_started_at,question_index,total_questions").eq("id", sessionId).abortSignal(signal).single();
    if (error) throw error;
    return parsePlayerSession(data);
  } });
}
export function useQuizQuestions(sessionId: string | null, questionId: string | null) {
  return useQuery({ queryKey: [...quizQuestionsQueryKey(sessionId ?? "idle"), questionId], enabled: isQuizId(sessionId) && isQuizId(questionId), queryFn: async ({ signal }) => {
    if (!isQuizId(sessionId) || !isQuizId(questionId)) throw new Error("INVALID_INPUT");
    const { data, error } = await supabase.from("quiz_player_questions")
      .select("id,session_id,prompt,type,options,time_limit_seconds").eq("session_id", sessionId).eq("id", questionId).abortSignal(signal);
    if (error) throw error;
    return parsePlayerQuestions(data);
  }, refetchInterval: 2000 });
}
export function useQuizSessionRealtime(sessionId: string | null) {
  const client = useQueryClient();
  const dirty = useRef(false);
  const options = useMemo(() => ({ type: "postgres" as const, channelName: `quiz-session:${sessionId ?? "idle"}`, table: "quiz_sessions", event: "UPDATE" as const,
    filter: `id=eq.${sessionId}`, enabled: isQuizId(sessionId), onChange: () => { dirty.current = true; } }), [sessionId]);
  useRealtime(options);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!dirty.current || !sessionId) return;
      dirty.current = false;
      void client.invalidateQueries({ queryKey: quizSessionQueryKey(sessionId) });
      void client.invalidateQueries({ queryKey: quizQuestionsQueryKey(sessionId) });
    }, 350);
    return () => window.clearInterval(timer);
  }, [client, sessionId]);
}
export function useJoinQuiz() {
  return useMutation({ retry: false, gcTime: 0, mutationFn: async (input: { sessionId: string; displayName: string; signal: AbortSignal }) =>
    parseQuizIdentity(await quizRequest({ operation: "join", sessionId: input.sessionId, displayName: input.displayName }, input.signal), input.sessionId) });
}
export function useSubmitQuizAnswer() {
  const client = useQueryClient();
  return useMutation({ retry: false, gcTime: 0, mutationFn: async ({ request, signal }: { request: QuizSubmitRequest; signal: AbortSignal }) =>
    parseQuizReceipt(await quizRequest(request, signal), request), onSuccess: receipt => {
      void client.invalidateQueries({ queryKey: ["quiz-leaderboard", receipt.session_id] });
    } });
}
