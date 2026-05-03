"use client";

import * as React from "react";

export interface ResultGridProps {
  winners: string[];
  isShow?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  itemClassName?: string;
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

  let containerClass = "max-h-auto";
  let itemClass = "";

  switch (size) {
    case "sm":
      containerClass = "max-h-60 items-center justify-start";
      itemClass = "max-w-15 text-lg";
      break;
    case "md":
      containerClass = "max-h-96 items-center justify-start";
      itemClass = "max-w-22.5 text-3xl";
      break;
    case "lg":
      containerClass = "max-h-96 items-center justify-start";
      itemClass = "max-w-22.5 px-4 py-3 text-4xl";
      break;
    case "xl":
      containerClass = "max-h-120 items-center justify-between";
      itemClass = "min-w-30 max-w-30 text-5xl";
      break;
  }

  return (
    <div className={`flex flex-wrap gap-2 ${containerClass} overflow-auto`}>
      {winners.map((winner, index) => (
        <div
          key={`${winner}-${index}`}
          className={`aspect-square w-full rounded-lg border bg-white/10 grid place-items-center font-mono font-semibold tabular-nums shadow-inner dark:bg-slate-950/20 ${itemClass} ${itemClassName}`.trim()}
        >
          {winner}
        </div>
      ))}
    </div>
  );
}
