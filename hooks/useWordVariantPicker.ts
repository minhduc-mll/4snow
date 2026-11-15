"use client";

import * as React from "react";

export function useWordVariantPicker(onSelect: (letter: string) => void, focusInput: () => void) {
  const [open,setOpen] = React.useState(false);
  const selected = React.useRef(false);
  const changeOpen = (next: boolean) => { if (next) selected.current = false; setOpen(next); };
  const select = (letter: string) => { selected.current = true; onSelect(letter); setOpen(false); };
  const closeAutoFocus = (event: Event) => { if (selected.current) { event.preventDefault(); focusInput(); } };
  return { open, changeOpen, select, closeAutoFocus };
}
