"use client";

import * as React from "react";
import { Upload } from "lucide-react";
import { Badge } from "@/components/atoms/Badge";
import { Button } from "@/components/atoms/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/Card";
import { Input } from "@/components/atoms/Input";
import { useAppI18n } from "@/hooks/useAppI18n";
import { useQuizImport } from "@/hooks/useQuizImport";

export function QuizImportPanel(): React.ReactElement {
  const { t } = useAppI18n();
  const { file, state, selectFile, parse } = useQuizImport();
  const warningText = (warning: string): string => {
    const match = /^Row (\d+): (missing question text|at least two options are required|missing correct answer)\.$/.exec(warning);
    if (!match) return warning;
    const key = match[2] === "missing question text" ? "question" : match[2] === "at least two options are required" ? "options" : "answer";
    return `${t("quizImport.row", { row: match[1] })}: ${t(`quizImport.${key}`)}`;
  };
  return (
    <Card className="w-full min-w-0 shadow-soft">
      <CardHeader>
        <CardTitle>{t("quiz.excelImportTitle")}</CardTitle>
        <CardDescription>{t("quiz.excelImportDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-6">
        <section className="grid min-w-0 gap-3" aria-labelledby="quiz-select-title">
          <h2 id="quiz-select-title" className="font-semibold">{t("quizImport.selectStep")}</h2>
          <p id="quiz-format" className="text-sm text-muted-foreground">{t("quizImport.format")}</p>
          <label htmlFor="quiz-file" className="text-sm font-medium">{t("quizImport.file")}</label>
          <Input id="quiz-file" type="file" accept=".xlsx,.xls,.csv" aria-describedby="quiz-format quiz-file-name" onChange={(event) => selectFile(event.target.files?.[0] ?? null)} className="max-w-full cursor-pointer border-dashed" />
          <p id="quiz-file-name" className="break-all text-sm">{file ? `${t("quizImport.selected")}: ${file.name}` : t("quizImport.noFile")}</p>
        </section>
        <section className="grid gap-3" aria-labelledby="quiz-parse-title">
          <h2 id="quiz-parse-title" className="font-semibold">{t("quizImport.parseStep")}</h2>
          <Button className="w-fit" disabled={!file || state.status === "parsing"} isLoading={state.status === "parsing"} leftIcon={<Upload className="size-4" aria-hidden />} onClick={() => void parse()}>{t("quiz.parseFile")}</Button>
          <div aria-live="polite">
            {state.status === "parsing" ? <p>{t("quizImport.parsing")}</p> : null}
            {state.status === "error" ? <p role="alert" className="text-destructive">{t("quizImport.parseError")}</p> : null}
          </div>
        </section>
        <section className="grid min-w-0 gap-3" aria-labelledby="quiz-preview-title">
          <h2 id="quiz-preview-title" className="font-semibold">{t("quizImport.previewStep")}</h2>
          <p className="text-sm text-muted-foreground">{t("quizImport.unsupported")}</p>
          {state.status === "complete" ? <>
            <div role="status" className="flex flex-wrap gap-2">
              <Badge variant="neutral">{state.result.questions.length} {t("quiz.validQuestions")}</Badge>
              <Badge variant={state.result.warnings.length ? "warning" : "neutral"}>{state.result.warnings.length} {t("quiz.warnings")}</Badge>
            </div>
            {state.result.warnings.length ? <ul aria-label={t("quiz.warnings")} className="grid gap-1 rounded-lg border bg-muted/40 p-3 text-sm">{state.result.warnings.map((warning, index) => <li key={index} className="break-words">{warningText(warning)}</li>)}</ul> : null}
            {state.result.questions.length ? <ol className="grid gap-3">{state.result.questions.map((question) => <li key={question.orderIndex} className="min-w-0 rounded-lg border p-3">
              <p className="break-words font-medium">{question.orderIndex + 1}. {question.prompt}</p>
              <ul className="mt-2 grid gap-1 text-sm">{question.options.map(option => <li key={option.id} className="break-words">{option.label}. {option.value}{question.correctOptionIds.includes(option.id) ? ` — ${t("quizImport.correct")}` : ""}</li>)}</ul>
            </li>)}</ol> : <p>{t("quizImport.noQuestions")}</p>}
          </> : <p className="text-sm text-muted-foreground">{t("quizImport.previewHint")}</p>}
        </section>
      </CardContent>
    </Card>
  );
}
