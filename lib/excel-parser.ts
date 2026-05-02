import * as XLSX from "xlsx";

import type { QuestionType, QuizOption } from "@/types/database";

export interface QuizImportRow extends Record<string, string | number | boolean | null | undefined> {
  question?: string;
  prompt?: string;
  type?: string;
  option_a?: string;
  option_b?: string;
  option_c?: string;
  option_d?: string;
  correct?: string;
  answer?: string;
  time_limit_seconds?: number | string;
  base_points?: number | string;
}

export interface ParsedQuizQuestion {
  prompt: string;
  type: QuestionType;
  options: QuizOption[];
  correctOptionIds: string[];
  timeLimitSeconds: number;
  basePoints: number;
  orderIndex: number;
}

export interface QuizImportResult {
  questions: ParsedQuizQuestion[];
  warnings: string[];
}

function getStringCell(row: QuizImportRow, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }

    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
  }

  return "";
}

function getNumberCell(
  row: QuizImportRow,
  keys: string[],
  fallback: number,
): number {
  const rawValue = getStringCell(row, keys);
  const parsed = Number(rawValue);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeQuestionType(value: string): QuestionType {
  if (value === "multiple_choice" || value === "true_false") {
    return value;
  }

  return "single_choice";
}

function buildOptions(row: QuizImportRow): QuizOption[] {
  return [
    { id: "a", label: "A", value: getStringCell(row, ["option_a", "a"]) },
    { id: "b", label: "B", value: getStringCell(row, ["option_b", "b"]) },
    { id: "c", label: "C", value: getStringCell(row, ["option_c", "c"]) },
    { id: "d", label: "D", value: getStringCell(row, ["option_d", "d"]) },
  ].filter((option) => option.value.length > 0);
}

function parseCorrectOptionIds(value: string): string[] {
  return value
    .split(",")
    .map((optionId) => optionId.trim().toLowerCase())
    .filter((optionId) => ["a", "b", "c", "d"].includes(optionId));
}

export async function parseQuizExcelFile(file: File): Promise<QuizImportResult> {
  try {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheetName = workbook.SheetNames[0];

    if (!sheetName) {
      throw new Error("Workbook does not contain any sheets.");
    }

    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      throw new Error("Unable to read the first worksheet.");
    }

    const rows = XLSX.utils.sheet_to_json<QuizImportRow>(worksheet, {
      defval: "",
    });
    const warnings: string[] = [];
    const questions: ParsedQuizQuestion[] = [];

    rows.forEach((row, index) => {
      const prompt = getStringCell(row, ["question", "prompt"]);
      const options = buildOptions(row);
      const correctOptionIds = parseCorrectOptionIds(
        getStringCell(row, ["correct", "answer"]),
      );

      if (!prompt) {
        warnings.push(`Row ${index + 2}: missing question text.`);
        return;
      }

      if (options.length < 2) {
        warnings.push(`Row ${index + 2}: at least two options are required.`);
        return;
      }

      if (correctOptionIds.length === 0) {
        warnings.push(`Row ${index + 2}: missing correct answer.`);
        return;
      }

      questions.push({
        prompt,
        type: normalizeQuestionType(getStringCell(row, ["type"])),
        options,
        correctOptionIds,
        timeLimitSeconds: getNumberCell(row, ["time_limit_seconds"], 20),
        basePoints: getNumberCell(row, ["base_points"], 1_000),
        orderIndex: questions.length,
      });
    });

    return { questions, warnings };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error("Unable to parse quiz workbook.");
  }
}
