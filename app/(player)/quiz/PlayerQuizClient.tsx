"use client";

import { useSearchParams } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/atoms/Card";
import { QuizCard } from "@/components/organisms/quiz/QuizCard";

export function PlayerQuizClient() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");
  const participantId = searchParams.get("participantId");
  const participantName = searchParams.get("name") ?? undefined;

  if (!sessionId) {
    return (
      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle>Quiz</CardTitle>
          <CardDescription>Missing session id</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Open this page with a `sessionId` query parameter.
        </CardContent>
      </Card>
    );
  }

  return (
    <QuizCard
      sessionId={sessionId}
      participantId={participantId}
      participantName={participantName}
    />
  );
}
