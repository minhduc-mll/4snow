"use client";

import * as React from "react";
import { motion } from "framer-motion";

import { Badge } from "@/components/atoms/Badge";
import { Button } from "@/components/atoms/Button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/atoms/Card";
import { useQuizLogic } from "@/hooks/useQuizLogic";
import { cn } from "@/lib/utils";
import type { QuizSession } from "@/types/database";

export interface QuizCardProps {
  sessionId: string;
  participantId?: string | null;
  participantName?: string;
  className?: string;
}

function getSessionLabel(session: QuizSession | undefined): string {
  if (!session) {
    return "Loading";
  }

  if (session.status === "active") {
    return "Live";
  }

  return session.status.charAt(0).toUpperCase() + session.status.slice(1);
}

export function QuizCard({
  sessionId,
  participantId = null,
  participantName,
  className,
}: QuizCardProps): React.ReactElement {
  const quiz = useQuizLogic({
    sessionId,
    participantId,
  });

  return (
    <Card className={cn("w-full max-w-2xl shadow-soft", className)}>
      <CardHeader>
        <CardTitle>{quiz.session?.title ?? "Quiz"}</CardTitle>
        <CardDescription>
          {participantName ? `Playing as ${participantName}` : "Live quiz round"}
        </CardDescription>
        <CardAction>
          <Badge variant={quiz.isLive ? "success" : "outline"}>
            {getSessionLabel(quiz.session)}
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="grid gap-5">
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
            <span>
              Question {(quiz.session?.question_index ?? 0) + 1}
              {quiz.session?.total_questions
                ? ` of ${quiz.session.total_questions}`
                : ""}
            </span>
            <motion.span
              key={quiz.countdown.remainingSeconds}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="font-medium tabular-nums text-foreground"
            >
              {quiz.countdown.remainingSeconds}s
            </motion.span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full origin-left rounded-full bg-primary"
              animate={{ scaleX: quiz.countdown.progress }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            />
          </div>
        </div>

        <div className="grid gap-3">
          <h2 className="text-xl font-semibold tracking-normal text-foreground">
            {quiz.isLoading
              ? "Loading question..."
              : (quiz.activeQuestion?.prompt ?? "Waiting for the host to start.")}
          </h2>

          <div className="grid gap-2">
            {quiz.activeQuestion?.options.map((option) => {
              const isSelected = quiz.selectedOptionIds.includes(option.id);

              return (
                <Button
                  key={option.id}
                  variant={isSelected ? "secondary" : "outline"}
                  className="h-auto justify-start px-4 py-3 text-left"
                  disabled={
                    !quiz.isLive ||
                    quiz.countdown.isExpired ||
                    quiz.answerStatus === "confirmed"
                  }
                  aria-pressed={isSelected}
                  onClick={() => quiz.selectOption(option.id)}
                >
                  <span className="font-semibold text-muted-foreground">
                    {option.label}
                  </span>
                  <span>{option.value}</span>
                </Button>
              );
            })}
          </div>
        </div>
      </CardContent>

      <CardFooter className="justify-between gap-3">
        <Badge
          variant={
            quiz.answerStatus === "confirmed"
              ? "success"
              : quiz.answerStatus === "rejected"
                ? "danger"
                : "neutral"
          }
        >
          {quiz.answerStatus === "idle" ? "Choose an answer" : quiz.answerStatus}
        </Badge>
        <Button
          isLoading={quiz.isSubmitting}
          disabled={!quiz.canSubmit}
          onClick={quiz.submitSelectedAnswer}
        >
          Submit answer
        </Button>
      </CardFooter>
    </Card>
  );
}
