"use client";

import * as React from "react";
import { useAppI18n } from "@/hooks/useAppI18n";
import { useVirtualWinnerRows, winnerGap } from "@/hooks/useVirtualWinnerRows";

export interface ResultGridProps {
  winners: string[];
  isShow?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  itemClassName?: string;
}

const gridSizes = {
  sm: { maxHeight: "max-h-60", tile: 60, text: "text-lg" },
  md: { maxHeight: "max-h-96", tile: 90, text: "text-3xl" },
  lg: { maxHeight: "max-h-96", tile: 90, text: "text-4xl" },
  xl: { maxHeight: "max-h-[min(45dvh,30rem)]", tile: 120, text: "text-4xl sm:text-5xl" },
};

const tileClass = "grid aspect-square shrink-0 place-items-center rounded-lg border bg-white/10 font-mono font-semibold tabular-nums shadow-inner dark:bg-slate-950/20";

type VirtualGridProps = { winners: string[]; maxTile: number; className: string; itemClass: string };

function VirtualWinnerGrid({ winners, maxTile, className, itemClass }: VirtualGridProps) {
  const { t } = useAppI18n();
  const { scrollRef, rows, columns, tileSize } = useVirtualWinnerRows(winners.length, maxTile);
  return (
    <div ref={scrollRef} role="region" aria-label={t("luckyDraw.winners")} tabIndex={0}
      className={`w-full min-w-0 overflow-y-auto [scrollbar-gutter:stable] focus-visible:outline-2 focus-visible:outline-ring ${className}`}>
      <div role="list" className="relative w-full" style={{ height: rows.getTotalSize() }}>
        {rows.getVirtualItems().map(row => {
          const start = row.index * columns;
          return (
            <div key={row.key} role="presentation" className="absolute inset-x-0 top-0 flex" style={{ gap: winnerGap, transform: `translateY(${row.start}px)` }}>
              {winners.slice(start, start + columns).map((winner, offset) => (
                <div key={start + offset} role="listitem" aria-posinset={start + offset + 1} aria-setsize={winners.length}
                  className={itemClass} style={{ width: tileSize, height: tileSize }}>
                  {winner}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ResultGrid({
  winners,
  isShow = true,
  size = "md",
  itemClassName = "",
}: ResultGridProps): React.ReactElement {
  if (!isShow) {
    return <div className="size-14" />;
  }

  const { maxHeight, tile, text } = gridSizes[size];
  const itemClass = `${tileClass} ${text} ${itemClassName}`;
  if (winners.length >= 50) {
    return <VirtualWinnerGrid winners={winners} maxTile={tile} className={maxHeight} itemClass={itemClass} />;
  }

  return (
    <div role="list" className={`flex min-w-0 flex-wrap items-center gap-2 ${maxHeight} overflow-auto`}>
      {winners.map((winner, index) => (
        <div key={`${winner}-${index}`} role="listitem" className={`w-full ${itemClass}`} style={{ maxWidth: tile }}>
          {winner}
        </div>
      ))}
    </div>
  );
}
