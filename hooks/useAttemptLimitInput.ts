"use client";

import * as React from "react";

export function useAttemptLimitInput(initial: number) {
  const [input,setInput] = React.useState(String(initial));
  const value = Number(input);
  const valid = input.trim() !== "" && Number.isInteger(value) && value >= 1 && value <= 12;
  return { input, setInput, value, valid, changed: value !== initial };
}
