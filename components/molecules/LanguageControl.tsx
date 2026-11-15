"use client";

import * as React from "react";
import { useAppI18n } from "@/hooks/useAppI18n";

type Props = { inline?: boolean };
export function LanguageControl({ inline = false }: Props) {
  const { t, language, setLanguage, isReady } = useAppI18n();
  const id = React.useId();
  const [failed,setFailed] = React.useState(false);
  const change = async (value: string) => {
    try { await setLanguage(value === "en" ? "en" : "vi"); setFailed(false); }
    catch { setFailed(true); }
  };
  const className = inline ? "flex flex-wrap items-center justify-center gap-2 rounded-lg border px-2 py-1 text-sm" : "fixed bottom-6 left-6 z-40 flex items-center gap-2 rounded-lg border bg-background/90 px-2 py-1 shadow-lg backdrop-blur";
  if (!isReady) return <div className={inline ? "h-10" : "fixed bottom-6 left-6 z-40 h-10 w-40"} aria-hidden />;
  return <div className={className}>
    <label htmlFor={id} className="text-xs text-muted-foreground">{t("luckyDraw.languageLabel")}</label>
    <select id={id} className="h-8 rounded-md border border-input bg-background px-2 text-sm" value={language} onChange={event => void change(event.target.value)}>
      <option value="vi">{t("luckyDraw.languageVietnamese")}</option><option value="en">{t("luckyDraw.languageEnglish")}</option>
    </select>
    {failed ? <span role="alert" className="text-xs">{t("wordGame.languageError")}</span> : null}
  </div>;
}
