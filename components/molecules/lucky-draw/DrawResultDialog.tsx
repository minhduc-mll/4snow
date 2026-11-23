"use client";

import * as React from "react";

import { Button } from "@/components/atoms/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/Dialog";
import { ResultGrid } from "@/components/molecules/lucky-draw/ResultGrid";

import { useDrawConfetti } from "@/hooks/useDrawConfetti";

interface DrawResultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  winnersDescription: string;
  title: string;
  closeLabel: string;
  winners: string[];
}

function DrawConfetti() {
  const canvas = useDrawConfetti();
  return <canvas ref={canvas} aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 size-full" />;
}

export function DrawResultDialog({
  open,
  onOpenChange,
  winnersDescription,
  title,
  closeLabel,
  winners,
}: DrawResultDialogProps): React.ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] max-w-xl overflow-y-auto motion-reduce:animate-none">
        {open && winners.length > 0 ? <DrawConfetti /> : null}
        <DialogHeader className="relative z-30">
          <DialogTitle className="text-2xl">{title}</DialogTitle>
          <DialogDescription className="text-base">
            {winnersDescription}
          </DialogDescription>
        </DialogHeader>
        <div className="relative z-30 min-w-0 py-4 sm:py-8">
          <ResultGrid size="xl" winners={winners} />
        </div>
        <DialogFooter className="relative z-30">
          <Button size="lg" onClick={() => onOpenChange(false)}>
            {closeLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
