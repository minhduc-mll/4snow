"use client";

import * as React from "react";

import { useAppI18n } from "@/hooks/useAppI18n";

export function GlobalLanguageControl(): React.ReactElement {
  const { t, language, setLanguage, isReady } = useAppI18n();

  if (!isReady) {
    return <div className="fixed bottom-6 left-6 z-40 h-10 w-40" aria-hidden />;
  }

  return (
    <div className="fixed bottom-6 left-6 z-40 flex items-center gap-2 rounded-lg border bg-background/90 px-2 py-1 shadow-lg backdrop-blur">
      <span className="text-xs text-muted-foreground">{t("luckyDraw.languageLabel")}</span>
      <select
        className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        value={language}
        onChange={(event) =>
          void setLanguage(event.target.value === "en" ? "en" : "vi")
        }
      >
        <option value="vi">{t("luckyDraw.languageVietnamese")}</option>
        <option value="en">{t("luckyDraw.languageEnglish")}</option>
      </select>
    </div>
  );
}
