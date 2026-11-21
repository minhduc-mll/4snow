"use client";

import * as React from "react";

const holdDelay = 425;
const movementTolerance = 10;

export function useWordVariantPicker(onKey: (letter: string, restoreFocus?: boolean) => void, focusInput: () => boolean) {
  const [open,setOpen] = React.useState(false);
  const selected = React.useRef(false);
  const press = React.useRef<{ timeout: number; pointerId: number; x: number; y: number } | null>(null);
  const held = React.useRef(false);
  const cancelHold = React.useCallback(() => {
    if (press.current) window.clearTimeout(press.current.timeout);
    press.current = null;
  }, []);
  React.useEffect(() => cancelHold, [cancelHold]);
  const changeOpen = (next: boolean) => { if (next) selected.current = false; setOpen(next); };
  const select = (letter: string) => { selected.current = true; onKey(letter,false); setOpen(false); };
  const closeAutoFocus = (event: Event) => { if (selected.current && focusInput()) event.preventDefault(); };
  const startHold = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    cancelHold();
    held.current = false;
    const button = event.currentTarget;
    const timeout = window.setTimeout(() => {
      press.current = null;
      if (button.disabled || !button.isConnected) return;
      held.current = true;
      changeOpen(true);
    }, holdDelay);
    press.current = { timeout, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const moveHold = (event: React.PointerEvent<HTMLButtonElement>) => {
    const pending = press.current;
    if (pending?.pointerId === event.pointerId && Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > movementTolerance) cancelHold();
  };
  const triggerProps = {
    onPointerDown: startHold,
    onPointerMove: moveHold,
    onPointerLeave: cancelHold,
    onPointerUp: cancelHold,
    onPointerCancel: cancelHold,
    onContextMenu: (event: React.MouseEvent<HTMLButtonElement>) => event.preventDefault(),
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== "ArrowUp" && !(event.shiftKey && event.key === "Enter")) return;
      event.preventDefault();
      if (!event.repeat) changeOpen(true);
    },
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      if (!held.current || event.detail === 0) onKey(event.currentTarget.value);
      held.current = false;
    },
  };
  return { open, changeOpen, select, closeAutoFocus, triggerProps };
}
