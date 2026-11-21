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
  const { local, remote, checkingRemote, reading, verifying, remoteError, fileError, selectedFiles, selectFiles, retainSelectedFiles, retry } = useDictionaryPreview(onUnauthorized);
  const importer = useDictionaryImport(onUnauthorized);
  const importEnabled = process.env.NEXT_PUBLIC_VTV_IMPORT_ENABLED === "true";
  const loading = reading || verifying;
  const localReady = local !== null && local.chunks.length > 0 && !local.issues.some((issue) => issue.blocking);
  const invalidSelection = fileError || (local !== null && !localReady);
  const verified = remote?.valid && local?.chunks[0]?.canonicalHash === remote.canonicalHash;
  const ready = localReady && (!checkingRemote || (verified && !remoteError));
  const issueCount = (code: ImportPreflight["issues"][number]["code"]) => local?.issues.filter((issue) => issue.code === code).length ?? 0;
  const receipts = importer.session?.receipts.length ?? 0;
  const status = importer.session?.status;
  const receivedAll = importer.session !== null && receipts === importer.session.expectedChunks;
  const { failure } = importer;
  const progressKey = status === "finalized" ? "finalized" : receivedAll
    ? importer.loading ? "finalizing" : "awaitingFinalization"
    : importer.loading ? "staging" : "interrupted";
  return (
    <Card className="w-full min-w-0 shadow-soft">
      <CardHeader>
        <CardTitle>{t("dictionaryPreview.title")}</CardTitle>
        <CardDescription id="dictionary-import-instructions">{t("dictionaryImport.datasetDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-4">
        <div className="grid min-w-0 gap-2">
          <label htmlFor="dictionary-preview-file" className="text-sm font-medium">{t("dictionaryImport.datasetFiles")}</label>
          <Input id="dictionary-preview-file" className="min-h-11 min-w-0" type="file" multiple accept=".json,application/json"
            aria-invalid={invalidSelection} aria-describedby={invalidSelection ? "dictionary-import-instructions dictionary-import-status" : "dictionary-import-instructions"}
            disabled={importer.loading} onChange={(event) => {
            rememberImportFiles(null);
            importer.clear();
            void selectFiles(Array.from(event.target.files ?? []));
          }} />
          {selectedFiles.length > 0 ? <details open className="min-w-0 text-sm">
            <summary className="min-h-11 cursor-pointer py-3 font-medium">
              {t("dictionaryImport.selectedFiles", { count: selectedFiles.length })}
            </summary>
            <ul className="list-disc space-y-1 pl-5">
              {selectedFiles.map((file, index) => <li key={index} className="[overflow-wrap:anywhere]">{file.name}</li>)}
            </ul>
          </details> : null}
        </div>
        {local ? (
          <section aria-label={t("dictionaryPreview.local")} className="grid gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
            <h3 className="font-semibold">{t("dictionaryPreview.local")}</h3>
            <p>{t("dictionaryPreview.entries")}: {local.entryCount} · {t("dictionaryImport.validEntries")}: {local.validCount} · {local.partSelection
              ? t("dictionaryImport.selectedParts", { selected: local.partSelection.selected, expected: local.partSelection.expected })
              : local.chunks.length ? `${t("dictionaryImport.parts")}: ${local.chunks.length}` : null}</p>
            <p>{t("dictionaryPreview.collisions")}: {issueCount("collision")} · {t("dictionaryPreview.duplicates")}: {issueCount("identity")} · {t("dictionaryImport.missingDefinitions")}: {issueCount("meaning")}</p>
            <p>{t("dictionaryImport.invalidLevels")}: {issueCount("length")} · {t("dictionaryImport.sourceIssues")}: {issueCount("source")}</p>
            {local.issues.length ? <>
              <p>{t("dictionaryImport.issues")}: {local.issues.length}</p>
              <ul className="list-disc space-y-1 pl-4">
                {local.issues.slice(0, 10).map((issue, index) => <li key={index} className="[overflow-wrap:anywhere]">
                  {[
                    issue.file,
                    issue.part === null ? null : t("dictionaryImport.partAt", { part: issue.part }),
                    issue.entry === null ? null : t("dictionaryImport.entryAt", { entry: issue.entry }),
                    issue.position ? t("dictionaryImport.position", issue.position) : null,
                  ].filter(Boolean).join(" · ")}{" "}
                  {issue.missingParts
                    ? t("dictionaryImport.missingParts", { count: issue.missingParts.length, parts: issue.missingParts.join(", ") })
                    : t(`dictionaryImport.issue.${issue.code}`)}
                </li>)}
              </ul>
              <Button type="button" variant="outline" className="min-h-11 w-fit" onClick={() => downloadReport(local)}>{t("dictionaryImport.report")}</Button>
            </> : null}
          </section>
        ) : null}
        <div id="dictionary-import-status" role="status" aria-atomic="true" className="grid gap-2 text-sm">
          {fileError ? <Badge variant="danger">{t("dictionaryPreview.fileError")}</Badge> : null}
          {reading ? <p>{t("dictionaryImport.readingFiles")}</p> : null}
          {fileError ? <p>{t("dictionaryWorkflow.fileHelp")}</p> : null}
          {!reading && local && !localReady ? <p className="sr-only">{t("dictionaryWorkflow.validationHelp")}</p> : null}
          {verifying ? <p>{t("dictionaryImport.verifyingFirstPart")}</p> : null}
          {remote && !verifying && !remoteError ? <section className="[overflow-wrap:anywhere]">
            <h3 className="font-semibold">{t("dictionaryPreview.remote")}</h3>
            <p>{verified ? t("dictionaryImport.firstPartVerified") : `${local?.chunks[0]?.file ?? ""} · ${t("dictionaryPreview.invalid")}`}</p>
            {!remote.valid && remote.errors.length > 0 ? <ul className="list-disc space-y-1 pl-5">
              {remote.errors.slice(0, 10).map(({ field }, index) => {
                const entry = /^entries\[(\d{1,3})\]$/.exec(field)?.[1];
                return <li key={index}>
                  {entry === undefined ? t("dictionaryImport.partAt", { part: 1 }) : t("dictionaryImport.entryAt", { entry: Number(entry) + 1 })}
                  {" · "}{t(entry === undefined ? "dictionaryImport.issue.metadata" : "dictionaryImport.issue.entry")}
                </li>;
              })}
            </ul> : null}
          </section> : null}
          {localReady && !checkingRemote ? <p>{t("dictionaryImport.verifyDuringUpload")}</p> : null}
          {remoteError ? <Badge variant="danger">{t("dictionaryPreview.remoteError")}</Badge> : null}
          {importer.session ? <p>{t("dictionaryImport.progress")}: {receipts}/{importer.session.expectedChunks} · {t(`dictionaryImport.${progressKey}`)}</p> : null}
          {importer.loading && !importer.session ? <p>{t("dictionaryImport.openingSession")}</p> : null}
          {importer.session?.createdCount != null ? <p>{t("dictionaryImport.created")}: {importer.session.createdCount} · {t("dictionaryImport.noop")}: {importer.session.noOpCount}</p> : null}
          {importer.waitingForQuota ? <p>{t("dictionaryImport.waitingForQuota")}</p> : null}
          {failure ? <p className="text-destructive [overflow-wrap:anywhere]">
            {[
              t(receivedAll ? "dictionaryImport.finalizationError" : "dictionaryImport.error"),
              failure.chunkIndex === undefined ? null : local?.chunks[failure.chunkIndex]?.file,
              failure.chunkIndex === undefined ? null : t("dictionaryImport.partAt", { part: failure.chunkIndex + 1 }),
              failure.entryIndex === undefined ? null : t("dictionaryImport.entryAt", { entry: failure.entryIndex + 1 }),
              failure.code,
            ].filter(Boolean).join(" · ")}
          </p> : null}
          {!importEnabled ? <p>{t("dictionaryImport.disabled")}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {remoteError ? <Button type="button" variant="outline" className="min-h-11" disabled={loading} onClick={retry}>{t("dictionaryImport.retry")}</Button> : null}
          <Button type="button" className="min-h-11" disabled={!importEnabled || !ready || loading || importer.loading || status === "finalized"} onClick={() => { if (local) { retainSelectedFiles(); importer.run(local); } }}>
            {t(failure ? "dictionaryImport.retry" : "dictionaryImport.start")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
