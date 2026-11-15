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
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { useQuizJoin } from "@/hooks/useQuizJoin";
import { isQuizId } from "@/lib/quiz/client";

function QuizSessionEntry({ sessionId }: { sessionId: string }): React.ReactElement {
  const { t } = useAppI18n();
  const join = useQuizJoin(sessionId);
  if (join.identity) return <QuizCard sessionId={sessionId} identity={join.identity} participantName={join.displayName} />;
  return (
    <Card className="w-full max-w-2xl shadow-soft">
      <CardHeader>
        <CardTitle>{join.session?.title ?? t("quiz.quiz")}</CardTitle>
        <CardDescription>{t("quiz.joinHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={join.submit} className="grid gap-3">
          <label htmlFor="quiz-display-name">{t("quiz.displayName")}</label>
          <Input id="quiz-display-name" name="displayName" autoComplete="nickname" required maxLength={80} value={join.displayName}
            onChange={event => join.setDisplayName(event.target.value)} disabled={join.pending} aria-describedby="quiz-join-hint" />
          <p id="quiz-join-hint" className="text-sm text-muted-foreground">{t("quiz.credentialHint")}</p>
          {join.session && join.session.status !== "lobby" ? <p role="status">{t("quiz.joinClosed")}</p> : null}
          {join.error ? <p role="alert">{t(`quiz.errors.${join.error}`)}</p> : null}
          {join.readError ? <><p role="alert">{t("quiz.readError")}</p><Button type="button" variant="outline" onClick={join.refresh}>{t("quiz.refresh")}</Button></> : null}
          <Button type="submit" disabled={!join.canJoin} isLoading={join.pending}>{t("quiz.join")}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function PlayerQuizClient(): React.ReactElement {
  const { t } = useAppI18n();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");

  if (!isQuizId(sessionId)) {
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

  return <QuizSessionEntry key={sessionId} sessionId={sessionId} />;
}
