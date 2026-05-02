"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Trophy } from "lucide-react";

import { Badge } from "@/components/atoms/Badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/atoms/Card";
import { useQuizLeaderboard } from "@/hooks/useQuizLogic";
import { cn } from "@/lib/utils";

export interface QuizLeaderboardProps {
  sessionId: string | null;
  limit?: number;
  className?: string;
}

export function QuizLeaderboard({
  sessionId,
  limit = 10,
  className,
}: QuizLeaderboardProps): React.ReactElement {
  const leaderboardQuery = useQuizLeaderboard(sessionId, limit);
  const participants = leaderboardQuery.data ?? [];

  return (
    <Card className={cn("w-full max-w-2xl shadow-soft", className)}>
      <CardHeader>
        <CardTitle>Leaderboard</CardTitle>
        <CardDescription>Live score snapshot</CardDescription>
        <CardAction>
          <Badge variant={leaderboardQuery.isFetching ? "outline" : "success"}>
            {leaderboardQuery.isFetching ? "Syncing" : "Live"}
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="grid gap-2">
        {participants.length > 0 ? (
          participants.map((participant, index) => (
            <motion.div
              key={participant.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="flex items-center justify-between gap-4 rounded-lg border bg-background px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                  {index + 1}
                </span>
                <span className="truncate text-sm font-medium text-foreground">
                  {participant.display_name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {index === 0 ? <Trophy className="size-4" aria-hidden /> : null}
                <span className="font-mono text-sm font-semibold tabular-nums">
                  {participant.score}
                </span>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            Waiting for scores
          </div>
        )}
      </CardContent>
    </Card>
  );
}
