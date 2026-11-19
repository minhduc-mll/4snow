"use client";

import * as React from "react";
import { parseQuizExcelFile, type QuizImportResult } from "@/lib/excel-parser";

type ImportState =
  | { status: "idle" }
  | { status: "parsing" }
  | { status: "complete"; result: QuizImportResult }
  | { status: "error" };

export function useQuizImport() {
  const [file, setFile] = React.useState<File | null>(null);
  const [state, setState] = React.useState<ImportState>({ status: "idle" });
  const generation = React.useRef(0);

  const selectFile = (next: File | null): void => {
    generation.current += 1;
    setFile(next);
    setState({ status: "idle" });
  };
  const parse = async (): Promise<void> => {
    if (!file || state.status === "parsing") return;
    const current = ++generation.current;
    setState({ status: "parsing" });
    try {
      const result = await parseQuizExcelFile(file);
      if (generation.current === current) setState({ status: "complete", result });
    } catch {
      if (generation.current === current) setState({ status: "error" });
    }
  };
  return { file, state, selectFile, parse };
}
