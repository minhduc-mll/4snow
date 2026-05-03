"use client";

import { motion } from "framer-motion";
import * as React from "react";

export interface SpinRevealBoxProps<TItem> {
  item: TItem;
  position: number;
  requestId: string;
  isAnimated: boolean;
  itemHeight?: number;
  ease: [number, number, number, number];
  buildSequence: (item: TItem, position: number) => TItem[];
  getDuration: (position: number, item: TItem) => number;
  getRevealDelayMs: (lastPosition: number) => number;
  renderItem: (item: TItem, index: number) => React.ReactNode;
  className?: string;
  animatedClassName?: string;
  staticClassName?: string;
}

export function SpinRevealBox<TItem>({
  item,
  position,
  requestId,
  isAnimated,
  itemHeight = 144,
  ease,
  buildSequence,
  getDuration,
  getRevealDelayMs,
  renderItem,
  className,
  animatedClassName,
  staticClassName,
}: SpinRevealBoxProps<TItem>): React.ReactElement {
  const sequence = React.useMemo(
    () => buildSequence(item, position),
    [buildSequence, item, position],
  );
  const targetY = -(sequence.length - 1) * itemHeight;
  const duration = getDuration(position, item);
  const revealDelayMs = getRevealDelayMs(position);

  if (!isAnimated) {
    return (
      <div className={staticClassName} data-reveal-delay-ms={revealDelayMs}>
        {renderItem(item, 0)}
      </div>
    );
  }

  return (
    <div className={animatedClassName} data-reveal-delay-ms={revealDelayMs}>
      <motion.div
        key={`${requestId}-${position}`}
        initial={{ y: 0 }}
        animate={{ y: targetY }}
        transition={{ duration, ease }}
        className={className}
      >
        {sequence.map((value, index) => (
          <div key={`${requestId}-${position}-${index}`} style={{ height: itemHeight }}>
            {renderItem(value, index)}
          </div>
        ))}
      </motion.div>
    </div>
  );
}
