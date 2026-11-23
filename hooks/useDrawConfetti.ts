"use client";

import { useEffect, useRef } from "react";
import type confetti from "canvas-confetti";

export function useDrawConfetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) return;

    let cancelled = false;
    let burst: ReturnType<typeof confetti.create> | undefined;
    const stop = () => { burst?.reset(); };
    reducedMotion.addEventListener("change", stop);
    void (async () => {
      try {
        const { default: confetti } = await import("canvas-confetti");
        if (cancelled || reducedMotion.matches) return;
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
        if (!canvas.width || !canvas.height) return;
        burst = confetti.create(canvas, { disableForReducedMotion: true });
        const compact = canvas.width < 440;
        const options = {
          particleCount: compact ? 18 : 28,
          spread: 48,
          startVelocity: compact ? 26 : 34,
          ticks: compact ? 75 : 90,
          scalar: compact ? 0.75 : 1,
        };
        void burst({ ...options, angle: 60, origin: { x: 0.06, y: 0.9 } })?.catch(stop);
        void burst({ ...options, angle: 120, origin: { x: 0.94, y: 0.9 } })?.catch(stop);
      } catch {
        stop();
      }
    })();

    return () => {
      cancelled = true;
      reducedMotion.removeEventListener("change", stop);
      stop();
    };
  }, []);

  return canvasRef;
}
