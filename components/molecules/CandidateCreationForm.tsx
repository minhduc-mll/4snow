"use client";

import { Button } from "@/components/atoms/Button";
import { Checkbox } from "@/components/atoms/Checkbox";
import { Input } from "@/components/atoms/Input";
import { useAppI18n } from "@/hooks/useAppI18n";
import { useCandidateCreation } from "@/hooks/useCandidateCreation";
import { useDictionaryDraft } from "@/hooks/useDictionaryDraft";

type Props = { draftRevision: string | undefined; onUnauthorized: () => void; onSelect: (id: string) => void; disabled: boolean };
const fieldClass = "w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground";

export function CandidateCreationForm({ draftRevision, onUnauthorized, onSelect, disabled }: Props) {
  const { t } = useAppI18n();
  const form = useCandidateCreation(draftRevision, onUnauthorized, onSelect);
  useDictionaryDraft({ dirty: form.dirty, busy: form.busy, save: () => form.save(false), discard: form.discard });
  const external = form.selectedSource && form.selectedSource.kind !== "internal-editorial";
  const lock = disabled || form.busy || form.canRetry;
  return (
    <form id="manual-candidate-form" aria-label={t("wordManagement.add")} onSubmit={form.submit} className="grid gap-4 rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{t("wordManagement.addHint")}</p>
      <fieldset className="grid gap-4" disabled={lock}>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid min-w-40 flex-1 gap-1">
            {t("editorial.original")}
            <Input required maxLength={120} aria-invalid={form.invalidSpelling || undefined} aria-describedby={form.invalidSpelling ? "manual-spelling-error" : undefined} value={form.original} onChange={event => form.setOriginal(event.target.value)} onBlur={form.checkSpelling} />
          </label>
          <Button type="button" variant="outline" disabled={!form.original.trim() || form.matches.isFetching} onClick={form.checkSpelling}>{t("wordManagement.check")}</Button>
        </div>
        {form.invalidSpelling ? <p id="manual-spelling-error" role="alert">{t("wordManagement.invalidSpelling")}</p> : null}
        {form.matches.isFetching && !form.matches.isFetchingNextPage ? <p role="status">{t("wordManagement.checking")}</p> : null}
        {form.matchingEntries.length > 0 ? (
          <section className="grid gap-2 rounded-md border p-3" aria-label={t("wordManagement.matches")}>
            <h4 className="font-medium">{t("wordManagement.matches")}</h4>
            <ul className="grid gap-2">
              {form.matchingEntries.map(item => (
                <li key={item.entryId} className="grid gap-1">
                  <span>{item.original} · {t(`editorial.${item.review}`)} · {item.sourceName}</span>
                  <span className="text-sm text-muted-foreground">{item.definitionVi ?? t("editorial.noDefinition")}</span>
                  <Button className="justify-self-start" type="button" variant="outline" onClick={() => onSelect(item.entryId)}>
                    {item.review === "withdrawn" ? t("wordManagement.openToRestore") : t("wordManagement.openToEdit")}
                  </Button>
                </li>
              ))}
            </ul>
            {form.matches.hasNextPage ? <Button type="button" variant="outline" disabled={form.matches.isFetching} onClick={() => void form.matches.fetchNextPage()}>{t("wordManagement.moreMatches")}</Button> : null}
            <label className="flex items-center gap-2">
              <Checkbox checked={form.alternate} onChange={event => form.setAlternate(event.target.checked)} />
              {t("wordManagement.alternate")}
            </label>
          </section>
        ) : null}
        {form.matches.isError ? <p role="alert">{t("wordManagement.checkError")} <Button type="button" variant="outline" onClick={() => void form.matches.refetch()}>{t("editorial.retry")}</Button></p> : null}
        <label className="grid gap-1">{t("wordManagement.optionalDefinition")}
          <textarea className={fieldClass} rows={3} maxLength={2000} value={form.definition} onChange={event => form.setDefinition(event.target.value)} />
        </label>
        <label className="grid gap-1">{t("wordManagement.source")}
          <select className={fieldClass} required value={form.sourceId} onChange={event => form.setSourceId(event.target.value)}>
            <option value="">{t("wordManagement.chooseSource")}</option>
            {form.sourceOptions.map(source => <option key={source.id} value={source.id}>{source.name} · {source.resourceRevision} · {t(`rights.${source.rightsDecision}`)}</option>)}
          </select>
        </label>
        {form.sources.isPending ? <p role="status">{t("editorial.loading")}</p> : null}
        {form.sources.isError ? <p role="alert">{t("wordManagement.sourceError")} <Button type="button" variant="outline" onClick={() => void form.sources.refetch()}>{t("editorial.retry")}</Button></p> : null}
        {form.sources.isSuccess && form.sourceOptions.length === 0 ? <p>{t("wordManagement.noSources")}</p> : null}
        {form.sources.hasNextPage ? <Button type="button" variant="outline" disabled={form.sources.isFetching} onClick={() => void form.sources.fetchNextPage()}>{t("wordManagement.moreSources")}</Button> : null}
        {external ? <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 sm:col-span-2">{t("wordManagement.entryUrl")}
            <Input required type="url" maxLength={2048} value={form.entryUrl} onChange={event => form.setEntryUrl(event.target.value)} />
          </label>
          <label className="grid gap-1">{t("wordManagement.sourceEntryId")}
            <Input required maxLength={300} value={form.sourceEntryId} onChange={event => form.setSourceEntryId(event.target.value)} />
          </label>
          <label className="grid gap-1">{t("wordManagement.sourceSenseId")}
            <Input maxLength={300} value={form.sourceSenseId} onChange={event => form.setSourceSenseId(event.target.value)} />
          </label>
        </div> : null}
        <Button className="justify-self-start" type="submit" disabled={!draftRevision || !form.selectedSource || !form.spellingChecked || (form.matchingEntries.length > 0 && !form.alternate)}>{t("wordManagement.saveCandidate")}</Button>
      </fieldset>
      {form.canRetry ? <Button className="justify-self-start" type="button" variant="outline" disabled={form.busy} onClick={form.retry}>{t("editorial.retry")}</Button> : null}
      {form.success || form.busy ? <p role="status">{t(form.busy ? "editorial.loading" : "wordManagement.saved")}</p> : null}
      {form.invalid || form.error ? <p role="alert">{t(form.invalid ? "wordManagement.invalid" : form.error === "SPELLING_EXISTS" ? "wordManagement.matches" : form.error === "REVISION_CONFLICT" ? "wordManagement.stale" : "editorial.saveError")}</p> : null}
    </form>
  );
}
