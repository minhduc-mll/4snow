"use client";

import { useRef, useState } from "react";
import { AttemptConfigurationForm } from "@/components/molecules/AttemptConfigurationForm";
import { DictionaryPreviewRound } from "@/components/molecules/DictionaryPreviewRound";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/atoms/Dialog";
import { spellingChangeKinds, type PublicationPreview } from "@/lib/vua-tieng-viet/publication-response";
import { Button } from "@/components/atoms/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/Card";
import { useDictionaryPublication } from "@/hooks/useDictionaryPublication";
import { useDictionaryNavigation } from "@/hooks/useDictionaryDraft";
import { useAppI18n } from "@/hooks/useAppI18n";
import { safeHttps } from "@/lib/vua-tieng-viet/safe-link";

type Props = { onUnauthorized: () => void };
const levels = ["3", "5", "7", "9"] as const;

function answerChanges(preview: PublicationPreview) {
  return levels.reduce((total, level) => ({
    added: total.added + preview.changes[level].answers.added,
    removed: total.removed + preview.changes[level].answers.removed,
  }), { added: 0, removed: 0 });
}

export function DictionaryPublicationPanel({ onUnauthorized }: Props) {
  const { t } = useAppI18n();
  const model = useDictionaryPublication(onUnauthorized);
  const guard = useDictionaryNavigation();
  const preview = model.preview;
  const [confirmation, setConfirmation] = useState<PublicationPreview | null>(null);
  const [practice, setPractice] = useState<PublicationPreview | null>(null);
  const [configurationDirty, setConfigurationDirty] = useState(false);
  const publishButton = useRef<HTMLButtonElement>(null);
  const practiceButton = useRef<HTMLButtonElement>(null);
  const statusBanner = useRef<HTMLDivElement>(null);
  const currentReleaseId = model.published?.releaseId ?? preview?.expectedCurrentReleaseId;
  const draft = model.configuration?.configuration ?? preview?.configuration;
  return <Card className="min-w-0"><CardHeader><CardTitle>{t("publication.title")}</CardTitle><CardDescription>{t("publication.description")}</CardDescription></CardHeader>
    <CardContent className="grid min-w-0 gap-4 wrap-anywhere">
      {process.env.NEXT_PUBLIC_VTV_IMPORT_ENABLED !== "true" ? <p>{t("dictionaryImport.disabled")}</p> : <>
        <div ref={statusBanner} tabIndex={-1} role={model.stale && !model.busy ? "alert" : "status"} aria-atomic="true" className="rounded-lg border bg-muted/40 p-3 text-sm">{model.busy ? t("publication.busy") : model.stale ? t("publication.stale") : model.published ? `${t("publication.published")} ${model.published.releaseId}` : configurationDirty ? t("publication.saveDraftFirst") : preview ? preview.valid ? t("publication.ready") : t("publication.blocked") : t("publication.start")}</div>
        <dl className="grid gap-2 sm:grid-cols-2">
          <div className="grid content-start gap-1 rounded-lg border p-3 text-sm">
            <dt className="font-semibold">{t("publication.draftSummary")}</dt>
            <dd>{draft ? t("attemptConfiguration.draft", {
              attempts: draft.attemptLimit,
              clues: draft.initialAbsentCount ?? 0,
              revision: model.configuration?.draftRevision ?? preview?.draftRevision,
            }) : t("attemptConfiguration.load")}</dd>
            {preview ? <dd>{t("publication.answerDelta")} · {t("publication.delta", answerChanges(preview))}</dd> : null}
          </div>
          <div className="grid content-start gap-1 rounded-lg border p-3 text-sm">
            <dt className="font-semibold">{t("publication.currentSummary")}</dt>
            <dd className="text-muted-foreground">{currentReleaseId === undefined ? t("publication.start") : currentReleaseId ?? t("publication.noCurrentRelease")}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button className="min-h-11 whitespace-normal" variant="outline" disabled={model.busy || model.canRetry} onClick={() => guard(() => { void model.refresh(); })}>{t("publication.preview")}</Button>
          <Button className="min-h-11 whitespace-normal" ref={publishButton} disabled={model.busy || model.canRetry || model.stale || configurationDirty || !preview?.valid || !!model.published} onClick={() => { if (preview?.valid) setConfirmation(preview); }}>{t("publication.publish")}</Button>
          {preview?.valid ? <Button className="min-h-11 whitespace-normal" ref={practiceButton} variant="outline" disabled={model.busy || model.stale || configurationDirty} onClick={() => setPractice(preview)}>{t("publication.testRound")}</Button> : null}
          {model.canRetry ? <Button className="min-h-11" disabled={model.busy} onClick={model.retry}>{t("editorial.retry")}</Button> : null}
        </div>
        {model.error && !model.stale ? <p role="alert">{t("publication.error")}</p> : null}
        {preview && !preview.valid ? <section aria-label={t("publication.validation")} className="grid gap-2 rounded-lg border p-3">
          <h3 className="font-semibold">{t("publication.validation")} ({preview.errorCount})</h3>
          <ul className="grid gap-1 text-sm">{preview.errors.map((error, index) => <li key={index}>{t(`publication.codes.${error.code}`, { defaultValue: t("publication.invalid") })} {error.level ?? ""} {error.normalized ?? ""} {error.id ?? ""}</li>)}</ul>
          {preview.errorCount > preview.errors.length ? <p className="text-sm">{t("publication.moreErrors")}</p> : null}
          <a href="#dictionary/review" className="flex min-h-11 w-fit items-center rounded-sm text-sm font-medium text-primary underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{t("publication.reviewAction")}</a>
        </section> : null}
        {preview ? <>
          <ul className="grid gap-2 sm:grid-cols-2">{levels.map(level => {
            const delta = preview.changes[level];
            return <li className="grid gap-1 rounded-lg border p-3 text-sm" key={level}>
              <strong>{level} {t("publication.letters")}</strong>
              <span>{t("publication.guesses")}: {preview.coverage[level]?.guesses} ({t("publication.delta", delta.guesses)})</span>
              <span>{t("publication.answers")}: {preview.coverage[level]?.answers} ({t("publication.delta", delta.answers)})</span>
            </li>;
          })}</ul>
        </> : null}
        {model.configuration ? <AttemptConfigurationForm key={model.configuration.configuration.configurationId} configuration={model.configuration} disabled={model.busy || model.canRetry} busy={model.busy} onDirtyChange={setConfigurationDirty} onSave={model.configure} onDiscard={model.discardConfiguration} /> : null}
        {preview ? <>
          {preview.spellingChanges ? <details className="rounded-lg border px-3 text-sm">
            <summary className="min-h-11 cursor-pointer py-3 font-semibold">{t("publication.spellingChanges")}</summary>
            <div className="grid gap-2 pb-3">
              {spellingChangeKinds.every(kind => !preview.spellingChanges?.[kind]) ? <p className="text-sm text-muted-foreground">{t("publication.noSpellingChanges")}</p> : null}
              {spellingChangeKinds.map(kind => {
                const group = preview.spellingChanges?.[kind];
                if (!group) return null;
                return <details key={kind} className="rounded-lg border px-3 text-sm">
                  <summary className="min-h-11 cursor-pointer py-3 font-medium">{t(`publication.spellingChange.${kind}`)} ({group.total})</summary>
                  <ul className="flex flex-wrap gap-2 pb-3">{group.items.map(item => <li key={item.normalized} className="rounded bg-muted px-2 py-1">
                    {item.normalized} · {item.level} {t("publication.letters")}
                  </li>)}</ul>
                  {group.total > group.items.length ? <p className="pb-3 text-muted-foreground">{t("publication.moreSpellings")}</p> : null}
                </details>;
              })}
            </div>
          </details> : null}
          <details className="rounded-lg border px-3 text-sm">
            <summary className="min-h-11 cursor-pointer py-3 font-semibold">{t("publication.buildDetails")}</summary>
            <div className="grid gap-2 pb-3">
              <p>{t("publication.build")} · {preview.buildId}</p>
              <p>SHA-256 · {preview.contentHash}</p>
              <p>{t("publication.payloadSize", { bytes: preview.payloadBytes.toLocaleString() })}</p>
              <p>{t("publication.sources")} · {preview.sourceCount} · {t("publication.attributions")} · {preview.attributionCount}</p>
              {preview.sources.length ? <ul className="grid gap-1">{preview.sources.map(source => <li key={source.id}>{source.name} · {source.revision}</li>)}</ul> : null}
              {preview.sourceCount > preview.sources.length ? <p className="text-muted-foreground">{t("publication.moreSources")}</p> : null}
            </div>
          </details>
          <details className="rounded-lg border px-3">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">{t("publication.playerPreview")}</summary>
            <section aria-label={t("publication.playerPreview")} className="grid gap-3 pb-3">
              <p className="text-sm text-muted-foreground">{t("publication.sampleHint")}</p>
              {levels.map(level => preview.playerSamples[level].length ? <details className="rounded-lg border px-3 text-sm" key={level}>
                <summary className="min-h-11 cursor-pointer py-3 font-medium">{level} {t("publication.letters")} ({preview.playerSamples[level].length})</summary>
                <div className="grid gap-3 pb-3">
                  {preview.playerSamples[level].map(sample => {
                    const credits = preview.sampleAttributions.filter(attr => sample.attributionIds.includes(attr.id));
                    return <div className="grid gap-2 rounded-lg bg-muted/40 p-3" key={sample.id}>
                      <p className="font-medium">{sample.original}</p><p>{sample.definitionVi}</p>
                      <p className="break-words">{t("wordGame.openingClue")} · {sample.openingClue ?? sample.definitionVi}</p>
                      {credits.length ? <details>
                        <summary className="min-h-11 cursor-pointer py-3 font-medium">{t("publication.attributions")}</summary>
                        <ul className="grid gap-3">
                          {credits.map(attr => <li key={attr.id} className="grid gap-1 text-muted-foreground">
                            <p>{attr.sourceName} · {attr.attributionText}</p><p>{attr.licenseName} {attr.licenseVersion} · {attr.modificationsNotice}</p>
                            <div className="flex flex-wrap gap-x-3">
                              {[
                                { label: t("editorial.sourceLink"), url: attr.entryUrl },
                                { label: t("editorial.licenseLink"), url: attr.licenseUrl },
                                { label: t("editorial.historyLink"), url: attr.historyUrl },
                              ].map(link => {
                                const href = safeHttps(link.url);
                                return href ? <a key={link.label} className="flex min-h-11 items-center text-primary underline" href={href} target="_blank" rel="noopener noreferrer">{link.label}</a> : null;
                              })}
                            </div>
                          </li>)}
                        </ul>
                      </details> : null}
                    </div>;
                  })}
                </div>
              </details> : null)}
            </section>
          </details>
        </> : null}
      </>}
      <Dialog open={confirmation !== null} onOpenChange={open => { if (!open) setConfirmation(null); }}>
        <DialogContent className="max-h-[85dvh] wrap-anywhere" onCloseAutoFocus={event => {
          event.preventDefault();
          (publishButton.current?.disabled ? statusBanner.current : publishButton.current)?.focus();
        }}>
          <DialogHeader>
            <DialogTitle>{t("publication.confirmTitle")}</DialogTitle>
            <DialogDescription>{t("publication.confirmDescription")}</DialogDescription>
          </DialogHeader>
          {confirmation ? <>
            <p className="text-sm">{t("publication.build")} · {confirmation.buildId}</p>
            <p className="text-sm">{t("publication.confirmRevision", { revision: confirmation.draftRevision, hash: confirmation.contentHash })}</p>
            <p className="text-sm">{confirmation.expectedCurrentReleaseId ? t("publication.baseline", { release: confirmation.expectedCurrentReleaseId }) : t("publication.firstRelease")}</p>
            <p className="text-sm">{t("publication.attempts")} · {confirmation.configuration.attemptLimit} · {t("attemptConfiguration.clues")} · {confirmation.configuration.initialAbsentCount ?? 0}</p>
            <p className="text-sm">{t("publication.answerDelta")} · {t("publication.delta", answerChanges(confirmation))}</p>
            <DialogFooter>
              <Button className="min-h-11" variant="outline" onClick={() => setConfirmation(null)}>{t("publication.cancel")}</Button>
              <Button className="min-h-11 whitespace-normal" disabled={model.busy || model.canRetry || model.stale || preview?.buildId !== confirmation.buildId || preview.contentHash !== confirmation.contentHash} onClick={() => {
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
