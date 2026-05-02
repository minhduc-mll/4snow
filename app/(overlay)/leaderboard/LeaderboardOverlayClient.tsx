"use client";

import { useSearchParams } from "next/navigation";

import { QuizLeaderboard } from "@/components/organisms/quiz/QuizLeaderboard";

export function LeaderboardOverlayClient() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");

  return <QuizLeaderboard sessionId={sessionId} />;
}
