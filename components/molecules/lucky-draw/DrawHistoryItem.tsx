"use client";

import * as React from "react";

import { Badge } from "@/components/atoms/Badge";
import { ResultGrid } from "@/components/molecules/lucky-draw/ResultGrid";
import { useAppI18n } from "@/hooks/useAppI18n";

export interface DrawHistoryItemData {
  prizeName: string;
  winners: string[];
  createdAt: string;
}

export function DrawHistoryItem({
  result,
  compact = true,
}: {
  result: DrawHistoryItemData;
  compact?: boolean;
}): React.ReactElement {
  const { t } = useAppI18n();
  return (
    <div className="grid gap-2 rounded-lg border bg-white/10 p-3 dark:bg-slate-950/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-foreground">{result.prizeName}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(result.createdAt).toLocaleString()}
          </p>
        </div>
        <Badge variant="success">{t("luckyDrawUX.historyWinners", { winners: result.winners.length })}</Badge>
      </div>
      <ResultGrid winners={result.winners} size={compact ? "sm" : "md"} />
    </div>
  );
}
