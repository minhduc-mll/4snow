"use client";

import * as React from "react";
import { Upload } from "lucide-react";

import { Badge } from "@/components/atoms/Badge";
import { Button } from "@/components/atoms/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/atoms/Card";
import { Input } from "@/components/atoms/Input";
import {
  parseQuizExcelFile,
  type ParsedQuizQuestion,
} from "@/lib/excel-parser";

export function QuizImportPanel(): React.ReactElement {
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [questions, setQuestions] = React.useState<ParsedQuizQuestion[]>([]);
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isParsing, setIsParsing] = React.useState(false);

  const handleParse = async (): Promise<void> => {
    if (!selectedFile) {
      return;
    }

    setIsParsing(true);
    setErrorMessage(null);

    try {
      const result = await parseQuizExcelFile(selectedFile);
      setQuestions(result.questions);
      setWarnings(result.warnings);
    } catch (error) {
      setQuestions([]);
      setWarnings([]);
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to import quiz file.",
      );
    } finally {
      setIsParsing(false);
    }
  };

  return (
    <Card className="w-full shadow-soft">
      <CardHeader>
        <CardTitle>Quiz Excel Import</CardTitle>
        <CardDescription>
          Parse question rows in the browser before saving through Supabase RLS.
        </CardDescription>
      </CardHeader>

      <CardContent className="grid gap-4">
        <Input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
          className="cursor-pointer border-dashed"
        />

        <div className="flex flex-wrap gap-2">
          <Badge variant="neutral">{questions.length} valid questions</Badge>
          <Badge variant={warnings.length > 0 ? "warning" : "neutral"}>
            {warnings.length} warnings
          </Badge>
        </div>

        {warnings.length > 0 ? (
          <div className="grid gap-1 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
            {warnings.slice(0, 4).map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        ) : null}

        {errorMessage ? (
          <Badge variant="danger" className="w-fit">
            {errorMessage}
          </Badge>
        ) : null}
      </CardContent>

      <CardFooter className="justify-end">
        <Button
          disabled={!selectedFile}
          isLoading={isParsing}
          leftIcon={<Upload className="size-4" aria-hidden />}
          onClick={handleParse}
        >
          Parse file
        </Button>
      </CardFooter>
    </Card>
  );
}
