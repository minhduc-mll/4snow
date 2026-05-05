"use client";

import { Play, RotateCw } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/atoms/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/Dialog";
import { SpinRevealBox } from "@/components/molecules/lucky-draw/SpinRevealBox";

interface LuckyDrawExpandedDrawDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prizeName: string;
  digits: string;
  requestId: string;
  isAnimated: boolean;
  isLoading: boolean;
  canDraw: boolean;
  drawLabel: string;
  onDraw: () => void;
  getDigitSequence: (targetDigit: string, position: number) => string[];
  getDigitDuration: (position: number) => number;
  getRevealDelayMs: (lastPosition: number) => number;
  ease: [number, number, number, number];
}

export function LuckyDrawExpandedDrawDialog({
  open,
  onOpenChange,
  prizeName,
  digits,
  requestId,
  isAnimated,
  isLoading,
  canDraw,
  drawLabel,
  onDraw,
  getDigitSequence,
  getDigitDuration,
  getRevealDelayMs,
  ease,
}: LuckyDrawExpandedDrawDialogProps): React.ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] lg:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="text-4xl font-bold">{prizeName}</DialogTitle>
          <DialogDescription className="hidden">
            Expanded draw panel
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <div className="flex flex-wrap items-center justify-center gap-4 rounded-xl border border-muted/50 bg-white/10 p-8 shadow-sm sm:gap-6 sm:p-10 dark:bg-slate-950/20">
            {digits.split("").map((digit, index) => (
              <SpinRevealBox<string>
                key={`expanded-${requestId}-${index}`}
                item={digit}
                position={index}
                requestId={`expanded-${requestId}`}
                isAnimated={isAnimated}
                itemHeight={192}
                ease={ease}
                buildSequence={getDigitSequence}
                getDuration={getDigitDuration}
                getRevealDelayMs={getRevealDelayMs}
                animatedClassName="size-48 overflow-hidden rounded-xl border bg-white/10 shadow-inner dark:bg-slate-950/20"
                staticClassName="flex size-48 items-center justify-center rounded-xl border bg-white/10 font-mono text-9xl font-semibold tabular-nums shadow-inner dark:bg-slate-950/20"
                className="will-change-transform"
                renderItem={(item) => (
                  <div className="flex h-48 items-center justify-center font-mono text-9xl font-semibold tabular-nums">
                    {item}
                  </div>
                )}
              />
            ))}
          </div>

          <div className="flex justify-end">
            <Button
              size="lg"
              disabled={!canDraw}
              isLoading={isLoading}
              leftIcon={
                isLoading ? (
                  <RotateCw className="size-4" aria-hidden />
                ) : (
                  <Play className="size-4" aria-hidden />
                )
              }
              onClick={onDraw}
              className="px-8"
            >
              {drawLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

