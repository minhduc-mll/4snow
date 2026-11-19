"use client";

import * as React from "react";
import { useAppI18n } from "@/hooks/useAppI18n";
import { DictionaryPreviewPanel } from "./DictionaryPreviewPanel";
import { CandidateEditorialPanel } from "./CandidateEditorialPanel";
import { DictionaryPublicationPanel } from "./DictionaryPublicationPanel";

type Step = "import" | "review" | "publish";
type Props = { onUnauthorized: () => void };
const steps: Step[] = ["import", "review", "publish"];

function readStep(): Step {
  const value = window.location.hash.slice(1).split("/")[1];
  return steps.find((step) => step === value) ?? "import";
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

function serverStep(): Step { return "import"; }

export function DictionaryWorkflow({ onUnauthorized }: Props): React.ReactElement {
  const { t } = useAppI18n();
  const step = React.useSyncExternalStore(subscribe, readStep, serverStep);
  const enabled = process.env.NEXT_PUBLIC_VTV_IMPORT_ENABLED === "true";
  return <section className="grid min-w-0 gap-4" aria-labelledby="dictionary-workflow-heading">
    <div>
      <h2 id="dictionary-workflow-heading" className="text-2xl font-semibold">{t("dictionaryWorkflow.title")}</h2>
      <p className="text-sm text-muted-foreground">{t("dictionaryWorkflow.description")}</p>
    </div>
    <nav aria-label={t("dictionaryWorkflow.navigation")} className="grid gap-2 sm:grid-cols-3">
      {steps.map((item, index) => <a key={item} href={`#dictionary/${item}`} aria-current={step === item ? "step" : undefined} className={`flex min-h-11 items-center gap-2 rounded-md border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${step === item ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>
        <span aria-hidden="true">{index + 1}.</span><span>{t(`dictionaryWorkflow.${item}`)}</span>{step === item ? <span className="ml-auto text-xs">{t("dictionaryWorkflow.current")}</span> : null}
      </a>)}
    </nav>
    <div hidden={step !== "import"}><DictionaryPreviewPanel onUnauthorized={onUnauthorized} /></div>
    {enabled ? <>
      <div hidden={step !== "review"}><CandidateEditorialPanel onUnauthorized={onUnauthorized} /></div>
      <div hidden={step !== "publish"}><DictionaryPublicationPanel onUnauthorized={onUnauthorized} /></div>
    </> : step !== "import" ? <p role="status" className="rounded-lg border bg-card p-4">{t("dictionaryImport.disabled")} {t("dictionaryWorkflow.disabledHelp")}</p> : null}
  </section>;
}
