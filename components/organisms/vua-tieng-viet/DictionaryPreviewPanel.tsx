"use client";

import * as React from "react";
import { Badge } from "@/components/atoms/Badge";
import { Button } from "@/components/atoms/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/Card";
import { Input } from "@/components/atoms/Input";
import { useAppI18n } from "@/hooks/useAppI18n";
import { useDictionaryPreview } from "@/hooks/useDictionaryPreview";
import { useDictionaryImport } from "@/hooks/useDictionaryImport";
import { rememberImportFiles } from "@/lib/vua-tieng-viet/import-selection";
import type { ImportPreflight } from "@/lib/vua-tieng-viet/import-preflight";

type Props = { onUnauthorized: () => void };

function issueLocation(issue: ImportPreflight["issues"][number]): string {
  return [issue.file, issue.part === null ? null : `#${issue.part}`, issue.entry === null ? null : `[${issue.entry}]`].filter(Boolean).join(" ");
}

function downloadReport(preflight: ImportPreflight): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(preflight.issues, null, 2)], { type: "application/json" }));
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = "dictionary-preflight.json";
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function DictionaryPreviewPanel({ onUnauthorized }: Props): React.ReactElement {
  const { t } = useAppI18n();
  const { local, remote, checkingRemote, loading, remoteError, fileError, selectFiles, retainSelectedFiles, retry } = useDictionaryPreview(onUnauthorized);
  const importer = useDictionaryImport(onUnauthorized);
  const importEnabled = process.env.NEXT_PUBLIC_VTV_IMPORT_ENABLED === "true";
  const ready = local !== null && local.chunks.length > 0 && !local.issues.some((issue) => issue.blocking) && (!checkingRemote || (remote?.valid && local.chunks[0]?.canonicalHash === remote.canonicalHash));
  const issueCount = (code: ImportPreflight["issues"][number]["code"]) => local?.issues.filter((issue) => issue.code === code).length ?? 0;
  const receipts = importer.session?.receipts.length ?? 0;
  const status = importer.session?.status;
  const receivedAll = importer.session !== null && receipts === importer.session.expectedChunks;
  const progressKey = status === "finalized" ? "finalized" : receivedAll
    ? importer.loading ? "finalizing" : "awaitingFinalization"
    : "staging";
  return (
    <Card className="w-full shadow-soft">
      <CardHeader>
        <CardTitle>{t("dictionaryPreview.title")}</CardTitle>
        <CardDescription>{t("dictionaryImport.datasetDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <label htmlFor="dictionary-preview-file" className="text-sm font-medium">{t("dictionaryImport.datasetFiles")}</label>
          <Input id="dictionary-preview-file" type="file" multiple accept=".json,application/json" disabled={importer.loading} onChange={(event) => {
            rememberImportFiles(null);
            importer.clear();
            void selectFiles(Array.from(event.target.files ?? []));
          }} />
        </div>
        {local ? (
          <section aria-label={t("dictionaryPreview.local")} className="grid gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
            <h3 className="font-semibold">{t("dictionaryPreview.local")}</h3>
            <p>{t("dictionaryPreview.entries")}: {local.entryCount} · {t("dictionaryImport.validEntries")}: {local.validCount} · {local.partSelection
              ? t("dictionaryImport.selectedParts", { selected: local.partSelection.selected, expected: local.partSelection.expected })
              : `${t("dictionaryImport.parts")}: ${local.chunks.length}`}</p>
            <p>{t("dictionaryPreview.collisions")}: {issueCount("collision")} · {t("dictionaryPreview.duplicates")}: {issueCount("identity")} · {t("dictionaryImport.missingDefinitions")}: {issueCount("meaning")}</p>
            <p>{t("dictionaryImport.invalidLevels")}: {issueCount("length")} · {t("dictionaryImport.sourceIssues")}: {issueCount("source")}</p>
            {local.issues.length ? <>
              <p>{t("dictionaryImport.issues")}: {local.issues.length}</p>
              <ul className="list-disc space-y-1 pl-4">
                {local.issues.slice(0, 10).map((issue, index) => <li key={index} className="break-words">
                  {issueLocation(issue)} {issue.missingParts
                    ? t("dictionaryImport.missingParts", { count: issue.missingParts.length, parts: issue.missingParts.join(", ") })
                    : issue.message}
                </li>)}
              </ul>
              <Button type="button" variant="outline" className="w-fit" onClick={() => downloadReport(local)}>{t("dictionaryImport.report")}</Button>
            </> : null}
          </section>
        ) : null}
        <div role="status" aria-atomic="true" className="grid gap-2 text-sm">
          {fileError ? <Badge variant="danger">{t("dictionaryPreview.fileError")}</Badge> : null}
          <p>{loading ? t("dictionaryPreview.loading") : fileError ? t("dictionaryWorkflow.fileHelp") : remoteError ? t("dictionaryWorkflow.previewHelp") : local && !ready ? t("dictionaryWorkflow.validationHelp") : !local ? t("dictionaryImport.datasetDescription") : null}</p>
          {remote ? <section aria-label={t("dictionaryPreview.remote")}>
            <h3 className="font-semibold">{t("dictionaryPreview.remote")}</h3>
            <p>{remote.valid && ready ? t("dictionaryImport.firstPartVerified") : t("dictionaryPreview.invalid")}</p>
          </section> : null}
          {remoteError ? <Badge variant="danger">{t("dictionaryPreview.remoteError")}</Badge> : null}
          {importer.session ? <p>{t("dictionaryImport.progress")}: {receipts}/{importer.session.expectedChunks} · {t(`dictionaryImport.${progressKey}`)}</p> : null}
          {importer.session?.createdCount != null ? <p>{t("dictionaryImport.created")}: {importer.session.createdCount} · {t("dictionaryImport.noop")}: {importer.session.noOpCount}</p> : null}
          {importer.waitingForQuota ? <p>{t("dictionaryImport.waitingForQuota")}</p> : null}
          {importer.errorCode ? <Badge variant="danger">{t(receivedAll ? "dictionaryImport.finalizationError" : "dictionaryImport.error")} ({importer.errorCode})</Badge> : null}
          {!importEnabled ? <p>{t("dictionaryImport.disabled")}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {remoteError ? <Button type="button" variant="outline" disabled={loading} onClick={retry}>{t("dictionaryImport.retry")}</Button> : null}
          <Button type="button" disabled={!importEnabled || !ready || loading || importer.loading || status === "finalized"} onClick={() => { if (local) { retainSelectedFiles(); importer.run(local); } }}>
            {t(importer.errorCode ? "dictionaryImport.retry" : "dictionaryImport.start")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
