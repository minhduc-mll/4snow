"use client";

import { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

export const winnerGap = 8;

export function useVirtualWinnerRows(count: number, maxTileSize: number) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const measure = () => { setWidth(element.clientWidth); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const tileSize = Math.min(width || maxTileSize, maxTileSize);
  const columns = Math.max(1, Math.floor((width + winnerGap) / (tileSize + winnerGap)));
  // Read the virtualizer's live range as it updates during scrolling.
  // eslint-disable-next-line react-hooks/incompatible-library
  const rows = useVirtualizer({
    count: Math.ceil(count / columns),
    getScrollElement: () => scrollRef.current,
    estimateSize: () => tileSize,
    gap: winnerGap,
    overscan: 3,
  });
  useEffect(() => { rows.measure(); }, [rows, columns, tileSize]);
  return { scrollRef, rows, columns, tileSize };
}
