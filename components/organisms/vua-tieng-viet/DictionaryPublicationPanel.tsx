"use client";

import { AttemptConfigurationForm } from "@/components/molecules/AttemptConfigurationForm";
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
  return <Card><CardHeader><CardTitle>{t("publication.title")}</CardTitle><CardDescription>{t("publication.description")}</CardDescription></CardHeader>
    <CardContent className="grid gap-4">
      {process.env.NEXT_PUBLIC_VTV_IMPORT_ENABLED !== "true" ? <p>{t("dictionaryImport.disabled")}</p> : <>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={model.busy || model.canRetry} onClick={() => void model.refresh()}>{t("publication.preview")}</Button>
          <Button disabled={model.busy || model.canRetry || !preview?.valid || !!model.published} onClick={model.publish}>{t("publication.publish")}</Button>
          {model.canRetry ? <Button disabled={model.busy} onClick={model.retry}>{t("editorial.retry")}</Button> : null}
        </div>
        <div role="status">{model.busy ? t("publication.busy") : model.published ? `${t("publication.published")} ${model.published.releaseId}` : preview ? preview.valid ? t("publication.ready") : t("publication.blocked") : t("publication.start")}</div>
        {model.error ? <p role="alert">{model.stale ? t("publication.stale") : t("publication.error")}</p> : null}
        {model.configuration ? <AttemptConfigurationForm key={`${model.configuration.configuration.configurationId}:${model.configuration.draftRevision}`} configuration={model.configuration} disabled={model.busy || model.canRetry} onSave={model.configure} /> : <p className="text-sm text-muted-foreground">{t("attemptConfiguration.load")}</p>}
        {preview ? <>
          <p>{t("publication.attempts")}: {preview.configuration.attemptLimit} · {t("publication.sources")}: {preview.sourceCount} · {t("publication.attributions")}: {preview.attributionCount}</p>
          <p className="break-all text-xs text-muted-foreground">{t("publication.build")}: {preview.buildId} · {preview.contentHash}</p>
          <ul className="grid gap-2 sm:grid-cols-2">{["3", "5", "7", "9"].map(level => <li className="rounded-lg border p-3" key={level}>{level} {t("publication.letters")} · {t("publication.guesses")}: {preview.coverage[level]?.guesses} · {t("publication.answers")}: {preview.coverage[level]?.answers}</li>)}</ul>
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
    </CardContent>
  </Card>;
}
