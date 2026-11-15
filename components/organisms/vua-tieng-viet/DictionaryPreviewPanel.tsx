"use client";

import * as React from "react";
import { Badge } from "@/components/atoms/Badge";
import { Button } from "@/components/atoms/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/Card";
import { Input } from "@/components/atoms/Input";
import { useAppI18n } from "@/hooks/useAppI18n";
import { useDictionaryPreview } from "@/hooks/useDictionaryPreview";
import { useDictionaryImport } from "@/hooks/useDictionaryImport";
import type { PreviewResult } from "@/lib/vua-tieng-viet/preview";

type Props = { onUnauthorized: () => void };
type SelectedDocument = { raw: unknown; artifactId: string; artifactRevision: string; chunkCount: number; chunkIndex: number };

function selectedDocument(value: unknown): SelectedDocument | null {
  if (typeof value !== "object" || value === null || !("artifactId" in value) || typeof value.artifactId !== "string" || !("artifactRevision" in value) || typeof value.artifactRevision !== "string" || !("chunkCount" in value) || typeof value.chunkCount !== "number" || !("chunkIndex" in value) || typeof value.chunkIndex !== "number") return null;
  return { raw: value, artifactId: value.artifactId, artifactRevision: value.artifactRevision, chunkCount: value.chunkCount, chunkIndex: value.chunkIndex };
}

export function DictionaryPreviewPanel({ onUnauthorized }: Props): React.ReactElement {
  const { t } = useAppI18n();
  const { local, remote, input, loading, remoteError, fileError, selectFile } = useDictionaryPreview(onUnauthorized);
  const importer = useDictionaryImport(onUnauthorized);
  const importEnabled = process.env.NEXT_PUBLIC_VTV_IMPORT_ENABLED === "true";
  const document = selectedDocument(input);
  const ready = document !== null && local?.valid === true && remote?.valid === true && local.canonicalHash !== null && local.canonicalHash === remote.canonicalHash;
  const matchingSession = document !== null && importer.session !== null && importer.session.artifactId === document.artifactId && importer.session.artifactRevision === document.artifactRevision;
  const result = (label: string, preview: PreviewResult): React.ReactElement => (
    <section aria-label={label} className="grid gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
      <h3 className="font-semibold">{label}</h3>
      <p>{preview.valid ? t("dictionaryPreview.valid") : t("dictionaryPreview.invalid")}</p>
      <p>{t("dictionaryPreview.entries")}: {preview.entryCount} · {t("dictionaryPreview.collisions")}: {preview.collisionCount}</p>
      <p>{t("dictionaryPreview.duplicates")}: {preview.duplicateCount} · {t("dictionaryPreview.conflicts")}: {preview.conflictCount}</p>
      {preview.errors.map((error, index) => <p key={`${error.field}-${index}`}>{error.field}: {error.message}</p>)}
      {preview.errorsTruncated ? <p>{t("dictionaryPreview.truncated")}</p> : null}
    </section>
  );
  return (
    <Card className="w-full shadow-soft">
      <CardHeader>
        <CardTitle>{t("dictionaryPreview.title")}</CardTitle>
        <CardDescription>{t("dictionaryPreview.description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <label htmlFor="dictionary-preview-file" className="text-sm font-medium">{t("dictionaryPreview.file")}</label>
        <Input id="dictionary-preview-file" type="file" accept=".json,application/json" onChange={(event) => void selectFile(event.target.files?.[0] ?? null)} />
        <div aria-live="polite" className="grid gap-3">
          {fileError ? <Badge variant="danger">{t("dictionaryPreview.fileError")}</Badge> : null}
          {local ? result(t("dictionaryPreview.local"), local) : null}
          {loading ? <p>{t("dictionaryPreview.loading")}</p> : null}
          {remote ? result(t("dictionaryPreview.remote"), remote) : null}
          {remoteError ? <Badge variant="danger">{t("dictionaryPreview.remoteError")}</Badge> : null}
          {importer.session ? <p>{t("dictionaryImport.progress")}: {importer.session.receipts.length}/{importer.session.expectedChunks} · {importer.session.status === "finalized" ? t("dictionaryImport.finalized") : t("dictionaryImport.staging")}</p> : null}
          {importer.session?.createdCount !== null && importer.session?.createdCount !== undefined ? <p>{t("dictionaryImport.created")}: {importer.session.createdCount} · {t("dictionaryImport.noop")}: {importer.session.noOpCount}</p> : null}
          {importer.session?.receipts.map((item) => <p key={item.chunkIndex}>{t("dictionaryImport.chunk")} {item.chunkIndex + 1}: {item.stagedCount} {t("dictionaryImport.entries")} · {t("dictionaryImport.provisional")}: {t("dictionaryImport.created")} {item.createdCount}, {t("dictionaryImport.noop")} {item.noOpCount}</p>)}
          {importer.errorCode ? <Badge variant="danger">{t("dictionaryImport.error")} ({importer.errorCode})</Badge> : null}
          {!importEnabled ? <p>{t("dictionaryImport.disabled")}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!importEnabled || !ready || importer.loading || importer.canRetry} onClick={() => { if (document) void importer.perform({ operation: "import-start", input: { artifactId: document.artifactId, artifactRevision: document.artifactRevision, chunkCount: document.chunkCount } }); }}>{t("dictionaryImport.start")}</Button>
          <Button disabled={!importEnabled || !ready || !matchingSession || importer.session?.status !== "staging" || importer.loading || importer.canRetry} onClick={() => { if (document && importer.session && local?.canonicalHash) void importer.perform({ operation: "import-apply", input: { importId: importer.session.importId, document: document.raw, canonicalHash: local.canonicalHash } }); }}>{t("dictionaryImport.apply")}</Button>
          <Button disabled={!importEnabled || !importer.session || importer.session.status !== "staging" || importer.session.receipts.length !== importer.session.expectedChunks || importer.loading || importer.canRetry} onClick={() => { if (importer.session) void importer.perform({ operation: "import-finalize", input: { importId: importer.session.importId, expectedDraftRevision: importer.session.draftRevision } }); }}>{t("dictionaryImport.finalize")}</Button>
          {importer.canRetry ? <Button disabled={importer.loading} onClick={() => void importer.retry()}>{t("dictionaryImport.retry")}</Button> : null}
        </div>
      </CardContent>
    </Card>
  );
}
