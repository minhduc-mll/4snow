"use client";

import * as React from "react";

export function useAttemptLimitInput(initial: number, min = 1, max = 12) {
  const [input,setInput] = React.useState(String(initial));
  const value = Number(input);
  const valid = input.trim() !== "" && Number.isInteger(value) && value >= min && value <= max;
  return { input, setInput, value, valid, changed: value !== initial };
}
