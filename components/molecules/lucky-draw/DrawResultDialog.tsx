"use client";

import { motion } from "framer-motion";
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

interface ConfettiParticle {
  id: number;
  x: number;
  y: number;
  rotate: number;
  size: number;
  color: string;
  delay: number;
  duration: number;
}

function createConfettiParticles(
  seed: number,
  direction: "left" | "right",
): ConfettiParticle[] {
  return Array.from({ length: 28 }, (_, index) => {
    const base = seed * 101 + index * 37;
    const spreadX = 80 + (base % 180);
    const x = direction === "left" ? spreadX : -spreadX;
    const y = -120 - (base % 220);
    const rotate = (base * 13) % 360;
    const size = 6 + (base % 8);
    const hue = base % 360;
    const delay = (index % 7) * 0.025;
    const duration = 0.85 + (base % 40) / 100;

    return {
      id: base,
      x,
      y,
      rotate,
      size,
      color: `hsl(${hue} 90% 60%)`,
      delay,
      duration,
    };
  });
}

function ConfettiCannons({ burstKey }: { burstKey: number }): React.ReactElement {
  const leftParticles = React.useMemo(
    () => createConfettiParticles(burstKey + 1, "left"),
    [burstKey],
  );
  const rightParticles = React.useMemo(
    () => createConfettiParticles(burstKey + 11, "right"),
    [burstKey],
  );

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      <div className="absolute bottom-8 left-6 size-2 rounded-full bg-white/90" />
      <div className="absolute bottom-8 right-6 size-2 rounded-full bg-white/90" />

      {leftParticles.map((particle) => (
        <motion.span
          key={`left-${particle.id}`}
          className="absolute bottom-9 left-7 block rounded-sm"
          style={{
            width: particle.size,
            height: particle.size * 0.6,
            backgroundColor: particle.color,
            boxShadow: "0 0 6px rgba(255,255,255,0.35)",
          }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
          animate={{
            x: particle.x,
            y: particle.y,
            rotate: particle.rotate,
            opacity: 0,
          }}
          transition={{
            duration: particle.duration,
            delay: particle.delay,
            ease: "easeOut",
          }}
        />
      ))}

      {rightParticles.map((particle) => (
        <motion.span
          key={`right-${particle.id}`}
          className="absolute bottom-9 right-7 block rounded-sm"
          style={{
            width: particle.size,
            height: particle.size * 0.6,
            backgroundColor: particle.color,
            boxShadow: "0 0 6px rgba(255,255,255,0.35)",
          }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
          animate={{
            x: particle.x,
            y: particle.y,
            rotate: -particle.rotate,
            opacity: 0,
          }}
          transition={{
            duration: particle.duration,
            delay: particle.delay,
            ease: "easeOut",
          }}
        />
      ))}
    </div>
  );
}

interface DrawResultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  winnersDescription: string;
  title: string;
  closeLabel: string;
  winners: string[];
}

export function DrawResultDialog({
  open,
  onOpenChange,
  winnersDescription,
  title,
  closeLabel,
  winners,
}: DrawResultDialogProps): React.ReactElement {
  const [confettiBurstKey, setConfettiBurstKey] = React.useState(0);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setConfettiBurstKey((current) => current + 1);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl overflow-hidden">
        <ConfettiCannons burstKey={confettiBurstKey} />
        <DialogHeader className="relative z-30">
          <DialogTitle className="text-2xl">{title}</DialogTitle>
          <DialogDescription className="text-base">
            {winnersDescription}
          </DialogDescription>
        </DialogHeader>
        <div className="relative z-30 mx-auto py-8">
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
