"use client";

import { useRef, useState } from "react";
import { AttemptConfigurationForm } from "@/components/molecules/AttemptConfigurationForm";
import { DictionaryPreviewRound } from "@/components/molecules/DictionaryPreviewRound";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/atoms/Dialog";
import { spellingChangeKinds, type PublicationPreview } from "@/lib/vua-tieng-viet/publication-response";
import { Button } from "@/components/atoms/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/Card";
import { useDictionaryPublication } from "@/hooks/useDictionaryPublication";
import { useAppI18n } from "@/hooks/useAppI18n";
import { safeHttps } from "@/lib/vua-tieng-viet/safe-link";

type Props = { onUnauthorized: () => void };
export function DictionaryPublicationPanel({ onUnauthorized }: Props) {
  const { t } = useAppI18n();
  const model = useDictionaryPublication(onUnauthorized);
  const preview = model.preview;
  const [confirmation, setConfirmation] = useState<PublicationPreview | null>(null);
  const [practice, setPractice] = useState<PublicationPreview | null>(null);
  const publishButton = useRef<HTMLButtonElement>(null);
  const practiceButton = useRef<HTMLButtonElement>(null);
  return <Card><CardHeader><CardTitle>{t("publication.title")}</CardTitle><CardDescription>{t("publication.description")}</CardDescription></CardHeader>
    <CardContent className="grid gap-4">
      {process.env.NEXT_PUBLIC_VTV_IMPORT_ENABLED !== "true" ? <p>{t("dictionaryImport.disabled")}</p> : <>
        <div role={model.stale && !model.busy ? "alert" : "status"} aria-atomic="true" className="rounded-lg border bg-muted/40 p-3 text-sm">{model.busy ? t("publication.busy") : model.stale ? t("publication.stale") : model.published ? `${t("publication.published")} ${model.published.releaseId}` : preview ? preview.valid ? t("publication.ready") : t("publication.blocked") : t("publication.start")}</div>
        {preview && !preview.valid ? <a href="#dictionary/review" className="w-fit rounded-sm text-sm font-medium text-primary underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{t("publication.reviewAction")}</a> : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={model.busy || model.canRetry} onClick={() => void model.refresh()}>{t("publication.preview")}</Button>
          <Button ref={publishButton} disabled={model.busy || model.canRetry || model.stale || !preview?.valid || !!model.published} onClick={() => { if (preview?.valid) setConfirmation(preview); }}>{t("publication.publish")}</Button>
          {preview?.valid ? <Button ref={practiceButton} variant="outline" disabled={model.busy} onClick={() => setPractice(preview)}>{t("publication.testRound")}</Button> : null}
          {model.canRetry ? <Button disabled={model.busy} onClick={model.retry}>{t("editorial.retry")}</Button> : null}
        </div>
        {model.error && !model.stale ? <p role="alert">{t("publication.error")}</p> : null}
        {model.configuration ? <AttemptConfigurationForm key={`${model.configuration.configuration.configurationId}:${model.configuration.draftRevision}`} configuration={model.configuration} disabled={model.busy || model.canRetry} onSave={model.configure} /> : <p className="text-sm text-muted-foreground">{t("attemptConfiguration.load")}</p>}
        {preview ? <>
          <p>{t("publication.attempts")}: {preview.configuration.attemptLimit} · {t("publication.sources")}: {preview.sourceCount} · {t("publication.attributions")}: {preview.attributionCount}</p>
          <p className="break-all text-xs text-muted-foreground">{t("publication.build")}: {preview.buildId} · {preview.contentHash}</p>
          <p className="text-sm">{t("publication.payloadSize", { bytes: preview.payloadBytes.toLocaleString() })}</p>
          <p className="break-all text-sm text-muted-foreground">{preview.expectedCurrentReleaseId
            ? t("publication.baseline", { release: preview.expectedCurrentReleaseId })
            : t("publication.firstRelease")}</p>
          <ul className="grid gap-2 sm:grid-cols-2">{["3", "5", "7", "9"].map(level => {
            const delta = preview.changes[level];
            return <li className="grid gap-1 rounded-lg border p-3 text-sm" key={level}>
              <strong>{level} {t("publication.letters")}</strong>
              <span>{t("publication.guesses")}: {preview.coverage[level]?.guesses} ({t("publication.delta", delta.guesses)})</span>
              <span>{t("publication.answers")}: {preview.coverage[level]?.answers} ({t("publication.delta", delta.answers)})</span>
            </li>;
          })}</ul>
          {preview.spellingChanges ? <section aria-label={t("publication.spellingChanges")} className="grid gap-2">
            <h3 className="font-semibold">{t("publication.spellingChanges")}</h3>
            {spellingChangeKinds.every(kind => !preview.spellingChanges?.[kind]) ? <p className="text-sm text-muted-foreground">{t("publication.noSpellingChanges")}</p> : null}
            {spellingChangeKinds.map(kind => {
              const group = preview.spellingChanges?.[kind];
              if (!group) return null;
              return <details key={kind} className="rounded-lg border p-3 text-sm">
                <summary className="cursor-pointer font-medium">{t(`publication.spellingChange.${kind}`)} ({group.total})</summary>
                <ul className="mt-2 flex flex-wrap gap-2">{group.items.map(item => <li key={item.normalized} className="rounded bg-muted px-2 py-1">
                  {item.normalized} · {item.level} {t("publication.letters")}
                </li>)}</ul>
                {group.total > group.items.length ? <p className="mt-2 text-muted-foreground">{t("publication.moreSpellings")}</p> : null}
              </details>;
            })}
          </section> : null}
          {preview.sources.length ? <details className="grid gap-2 rounded-lg border p-3 text-sm">
            <summary className="cursor-pointer font-medium">{t("publication.sources")} ({preview.sourceCount})</summary>
            <ul className="mt-2 grid gap-1">{preview.sources.map(source => <li className="break-words" key={source.id}>{source.name} · {source.revision}</li>)}</ul>
            {preview.sourceCount > preview.sources.length ? <p className="mt-2 text-muted-foreground">{t("publication.moreSources")}</p> : null}
          </details> : null}
          {preview.errorCount ? <section aria-label={t("publication.validation")} className="grid gap-2">
            <h3 className="font-semibold">{t("publication.validation")} ({preview.errorCount})</h3>
            <ul className="grid gap-1">{preview.errors.map((error, index) => <li className="break-all text-sm" key={index}>{t(`publication.codes.${error.code}`, { defaultValue: t("publication.invalid") })} {error.level ?? ""} {error.normalized ?? ""} {error.id ?? ""}</li>)}</ul>
            {preview.errorCount > preview.errors.length ? <p>{t("publication.moreErrors")}</p> : null}
          </section> : null}
          <section aria-label={t("publication.playerPreview")} className="grid gap-3">
            <h3 className="font-semibold">{t("publication.playerPreview")}</h3><p className="text-sm text-muted-foreground">{t("publication.sampleHint")}</p>
            {["3", "5", "7", "9"].flatMap(level => preview.playerSamples[level]?.map(sample => <div className="grid gap-2 rounded-lg border p-3" key={sample.id}>
              <p className="font-medium">{sample.original} · {sample.level}</p><p>{sample.definitionVi}</p>
              {preview.sampleAttributions.filter(attr => sample.attributionIds.includes(attr.id)).map(attr => <div key={attr.id} className="grid gap-1 text-sm text-muted-foreground">
                <p>{attr.sourceName} · {attr.attributionText}</p><p>{attr.licenseName} {attr.licenseVersion} · {attr.modificationsNotice}</p>
                <div className="flex flex-wrap gap-3">{[{ label: t("editorial.sourceLink"), url: attr.entryUrl }, { label: t("editorial.licenseLink"), url: attr.licenseUrl }, { label: t("editorial.historyLink"), url: attr.historyUrl }].map(link => { const href = safeHttps(link.url); return href ? <a key={link.label} className="text-primary underline" href={href} target="_blank" rel="noopener noreferrer">{link.label}</a> : null; })}</div>
              </div>)}
            </div>) ?? [])}
          </section>
        </> : null}
      </>}
      <Dialog open={confirmation !== null} onOpenChange={open => { if (!open) setConfirmation(null); }}>
        <DialogContent onCloseAutoFocus={event => {
          if (publishButton.current && !publishButton.current.disabled) {
            event.preventDefault();
            publishButton.current.focus();
          }
        }}>
          <DialogHeader>
            <DialogTitle>{t("publication.confirmTitle")}</DialogTitle>
            <DialogDescription>{t("publication.confirmDescription")}</DialogDescription>
          </DialogHeader>
          {confirmation ? <>
            <p className="break-all text-sm">{t("publication.build")}: {confirmation.buildId}</p>
            <p className="break-all text-sm">{t("publication.confirmRevision", { revision: confirmation.draftRevision, hash: confirmation.contentHash })}</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmation(null)}>{t("publication.cancel")}</Button>
              <Button disabled={model.busy || model.canRetry || model.stale || preview?.buildId !== confirmation.buildId || preview.contentHash !== confirmation.contentHash} onClick={() => {
                model.publish(confirmation);
                setConfirmation(null);
              }}>{t("publication.confirmAction")}</Button>
            </DialogFooter>
          </> : null}
        </DialogContent>
      </Dialog>
      <Dialog open={practice !== null} onOpenChange={open => { if (!open) setPractice(null); }}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto" onCloseAutoFocus={event => {
          if (practiceButton.current) {
            event.preventDefault();
            practiceButton.current.focus();
          }
        }}>
          <DialogHeader>
            <DialogTitle>{t("publication.testRound")}</DialogTitle>
            <DialogDescription>{t("publication.testDescription")}</DialogDescription>
          </DialogHeader>
          {practice ? <DictionaryPreviewRound key={practice.buildId} preview={practice} onUnauthorized={onUnauthorized} /> : null}
        </DialogContent>
      </Dialog>
    </CardContent>
  </Card>;
}
