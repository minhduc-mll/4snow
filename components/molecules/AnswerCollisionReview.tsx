"use client";

import { Button } from "@/components/atoms/Button";
import { useAppI18n } from "@/hooks/useAppI18n";
import type { useCandidateEditorial } from "@/hooks/useCandidateEditorial";
import { safeHttps } from "@/lib/vua-tieng-viet/safe-link";

type Props = { model: ReturnType<typeof useCandidateEditorial>; normalized: string; level: number };

export function AnswerCollisionReview({ model, normalized, level }: Props) {
  const { t } = useAppI18n();
  const page = model.collision;
  const blocked = model.saving || model.canRetry || model.canRetryRights || model.canRetrySelection || model.collisionLoading;
  return <section className="grid gap-3 rounded-lg border p-4" aria-label={t("collision.title")}>
    <h3 className="font-semibold">{t("collision.title")} · {normalized}</h3>
    <p className="text-sm text-muted-foreground">{t("collision.hint")}</p>
    <p role="status">{model.collisionLoading ? t("editorial.loading") : page?.unresolved ? t("collision.unresolved") : page?.answerRevisionId ? t("collision.resolved") : t("collision.noAnswer")}</p>
    {model.collisionError ? <p role="alert">{t("editorial.error")}</p> : null}
    <ul className="grid gap-3">{page?.items.map((item) => {
      const href = safeHttps(item.entryUrl);
      const selected = page.answerRevisionId === item.revisionId;
      return <li key={item.revisionId} className="grid gap-2 rounded-lg border p-3">
        <p className="font-medium">{item.original} · #{item.revisionNumber} · {t(`editorial.${item.review}`)}</p>
        <p>{item.definitionVi ?? t("editorial.noDefinition")}</p>
        <p className="break-all text-sm text-muted-foreground">{item.sourceName} · {item.sourceEntryId} · {item.sourceSenseId} · {item.revisionId}</p>
        {href ? <a className="text-primary underline" href={href} target="_blank" rel="noopener noreferrer">{t("editorial.sourceLink")}</a> : null}
        <Button variant={selected ? "secondary" : "outline"} disabled={blocked || !item.eligible || selected} onClick={() => {
          if (level === 3 || level === 5 || level === 7 || level === 9) void model.saveSelection({ normalized, level, entryRevisionId: item.revisionId, expectedDraftRevision: page.draftRevision }, false);
        }}>{selected ? t("collision.selected") : item.eligible ? t("collision.select") : t("collision.ineligible")}</Button>
      </li>;
    })}</ul>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={blocked || !model.collisionCursor} onClick={() => model.setCollisionCursor(null)}>{t("editorial.first")}</Button>
      <Button variant="outline" disabled={blocked || !page?.nextCursor} onClick={() => model.setCollisionCursor(page?.nextCursor ?? null)}>{t("editorial.next")}</Button>
      {model.canRetrySelection ? <Button disabled={model.saving} onClick={model.retrySelection}>{t("editorial.retry")}</Button> : null}
    </div>
    {model.selectionError ? <p role="alert">{t("editorial.saveError")}</p> : null}
  </section>;
}
