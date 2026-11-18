"use client";

import * as React from "react";
import { Button } from "@/components/atoms/Button";
import { useAppI18n } from "@/hooks/useAppI18n";
import type { useBulkEditorial } from "@/hooks/useBulkEditorial";
import { BULK_BATCH_SIZE, type BulkDecision, type BulkPage } from "@/lib/vua-tieng-viet/bulk-review-contract";
import type { ExclusionChecks } from "@/lib/vua-tieng-viet/editorial-contract";

type Model = ReturnType<typeof useBulkEditorial>;
type Props = { model: Model; openEntry: (id: string) => void };
type DecisionProps = { model: Model; page: BulkPage; saved: BulkDecision | null };
const categories = ["common", "regional", "technical", "less-common"] as const;
const checks: (keyof ExclusionChecks)[] = ["names", "abbreviations", "offensive", "malformed", "unverified"];

function BulkDecisionForm({ model, page, saved }: DecisionProps): React.ReactElement {
  const { t } = useAppI18n();
  const [category, setCategory] = React.useState<BulkDecision["category"]>("common");
  const [answerEligible, setAnswerEligible] = React.useState(false);
  const [rationale, setRationale] = React.useState("");
  const [exclusionChecks, setExclusionChecks] = React.useState<ExclusionChecks>({ names: false, abbreviations: false, offensive: false, malformed: false, unverified: false });
  const local = { category, answerEligible, rationale, exclusionChecks };
  const decision = saved ?? local;
  const ready = decision.rationale.trim().length > 0 && Object.values(decision.exclusionChecks).every(Boolean);
  const canRetry = model.error !== "REVISION_CONFLICT" && model.error !== "IDEMPOTENCY_CONFLICT" && model.error !== "VALIDATION_FAILED";
  return <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); if (ready && canRetry) void model.apply(decision); }}>
    <fieldset disabled={!!saved || model.saving} className="grid gap-2">
      <legend className="font-medium">{t("bulk.decision")}</legend>
      <label className="grid gap-1">{t("editorial.category")}
        <select value={decision.category} onChange={(event) => { const value = categories.find((entry) => entry === event.target.value); if (value) { setCategory(value); if (value !== "common") setAnswerEligible(false); } }} className="rounded-md border bg-background px-3 py-2">
          {categories.map((value) => <option key={value} value={value}>{t(value === "less-common" ? "editorial.lessCommon" : `editorial.${value}`)}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2"><input type="checkbox" disabled={decision.category !== "common"} checked={decision.answerEligible} onChange={(event) => setAnswerEligible(event.target.checked)} />{t("bulk.answers")}</label>
      <label className="grid gap-1">{t("editorial.rationale")}<textarea className="rounded-md border bg-background px-3 py-2" maxLength={2000} required value={decision.rationale} onChange={(event) => setRationale(event.target.value)} /></label>
      {checks.map((name) => <label className="flex items-center gap-2" key={name}><input type="checkbox" checked={decision.exclusionChecks[name]} onChange={(event) => setExclusionChecks({ ...exclusionChecks, [name]: event.target.checked })} />{t(`editorial.check_${name}`)}</label>)}
    </fieldset>
    <div><Button type="submit" disabled={!ready || !canRetry || model.saving}>{t(saved || page.checkpoint > 0 ? "bulk.resume" : "bulk.confirm")}</Button></div>
  </form>;
}

export function BulkEditorialReview({ model, openEntry }: Props): React.ReactElement {
  const { t } = useAppI18n();
  const page = model.page;
  return <section className="grid gap-3 rounded-lg border p-4" aria-label={t("bulk.title")}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">{t("bulk.title")}</h3>
      <Button variant="outline" onClick={model.clear} disabled={model.saving}>{t("bulk.clear")}</Button>
    </div>
    {model.error ? <p role="alert" className="text-destructive">{t(model.error === "REVISION_CONFLICT" || model.error === "IDEMPOTENCY_CONFLICT" ? "bulk.stale" : model.error === "RATE_LIMITED" ? "bulk.rate" : model.error === "VALIDATION_FAILED" ? "bulk.invalidScope" : "bulk.error")}</p> : null}
    {model.storageError ? <p role="status">{t("bulk.storageError")}</p> : null}
    {model.loading && !page ? <p role="status">{t("editorial.loading")}</p> : null}
    {page ? <>
      <p>{t("bulk.scope", { count: page.count })}</p>
      <p className="text-sm text-muted-foreground">{Object.entries(page.distribution).map(([level, count]) => `${level}: ${count}`).join(" · ")}</p>
      <p role="status">{t("bulk.progress", { done: page.checkpoint, total: page.count })} · {(["applied", "unchanged", "invalid", "conflict"] as const).map((status) => `${t(`bulk.${status}`)} ${page.totals[status]}`).join(" · ")}</p>
      <details open={page.offset === 0 || undefined}>
        <summary className="cursor-pointer">{t("bulk.rows", { start: page.offset + 1, end: page.offset + page.items.length })}</summary>
        <ul className="mt-2 grid max-h-80 gap-2 overflow-auto">
          {page.items.map((item) => <li key={item.entryId} className="rounded-md border p-2 text-sm">
            <Button size="sm" variant="outline" disabled={model.saving} onClick={() => openEntry(item.entryId)}>{item.original} · {item.level} · #{item.expectedEntryRevision}</Button>
            <p className="mt-1 break-words">{item.definitionVi ?? t("editorial.noDefinition")}</p>
            {item.blocker ? <p>{t(`bulk.${item.blocker}`)}</p> : null}
            {item.answerBlocker && item.answerBlocker !== item.blocker ? <p>{t("bulk.answerBlocked")} {t(`bulk.${item.answerBlocker}`)}</p> : null}
            {item.result ? <p>{t(`bulk.${item.result.status}`)} {item.result.reason ? t(`bulk.${item.result.reason}`) : ""}</p> : null}
          </li>)}
        </ul>
        <div className="mt-2 flex gap-2">
          <Button variant="outline" disabled={model.saving || page.offset === 0} onClick={model.previous}>{t("bulk.previous")}</Button>
          <Button variant="outline" disabled={model.saving || page.offset + BULK_BATCH_SIZE >= page.count} onClick={model.next}>{t("editorial.next")}</Button>
        </div>
      </details>
      {page.checkpoint < page.count || model.resume?.pending ? <BulkDecisionForm key={page.selectionId} model={model} page={page} saved={model.resume?.pending?.input ?? page.decision} /> : null}
    </> : null}
  </section>;
}
