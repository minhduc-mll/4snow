"use client";

import { useSearchParams } from "next/navigation";
import * as React from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/atoms/Card";
import { useAppI18n } from "@/hooks/useAppI18n";
import { QuizCard } from "@/components/organisms/quiz/QuizCard";

export function PlayerQuizClient(): React.ReactElement {
  const { t } = useAppI18n();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");
  const participantId = searchParams.get("participantId");
  const participantName = searchParams.get("name") ?? undefined;

  if (!sessionId) {
    return (
      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle>{t("quiz.quiz")}</CardTitle>
          <CardDescription>{t("quiz.missingSessionId")}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {t("quiz.missingSessionHint")}
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
