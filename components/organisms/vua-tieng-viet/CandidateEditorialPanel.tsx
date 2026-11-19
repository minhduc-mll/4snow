"use client";

import * as React from "react";
import { Badge } from "@/components/atoms/Badge";
import { Button } from "@/components/atoms/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/Card";
import { Input } from "@/components/atoms/Input";
import { BulkEditorialReview } from "@/components/molecules/BulkEditorialReview";
import { useBulkEditorial } from "@/hooks/useBulkEditorial";
import { AnswerCollisionReview } from "@/components/molecules/AnswerCollisionReview";
import { useAppI18n } from "@/hooks/useAppI18n";
import { useCandidateEditorial, useRightsReviewForm } from "@/hooks/useCandidateEditorial";
import { useEditorialFilters, useEditorialReviewForm } from "@/hooks/useEditorialForms";
import type { ExclusionChecks } from "@/lib/vua-tieng-viet/editorial-contract";
import { safeHttps } from "@/lib/vua-tieng-viet/safe-link";

type Props = { onUnauthorized: () => void };
type Editorial = ReturnType<typeof useCandidateEditorial>;
type Detail = NonNullable<Editorial["detail"]>;
const checkNames: (keyof ExclusionChecks)[] = ["names", "abbreviations", "offensive", "malformed", "unverified"];
const selectClass = "w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground";

function RightsEditor({ detail, model }: { detail: Detail; model: Editorial }): React.ReactElement {
  const { t } = useAppI18n();
  const form = useRightsReviewForm(detail.sourceId, detail.draftRevision, detail.rightsReview, model.saveRights);
  const preview = detail.attributionPreview;
  const links = [{ label: t("editorial.sourceLink"), url: preview.entryUrl }, { label: t("editorial.artifactLink"), url: preview.artifactUrl }, { label: t("editorial.licenseLink"), url: preview.licenseUrl }, { label: t("editorial.historyLink"), url: preview.historyUrl }];
  return <section className="grid gap-3 rounded-lg border p-4" aria-label={t("rights.title")}>
    <h3 className="font-semibold">{t("rights.title")}</h3>
    <p>{t("rights.claim")}</p>
    <h4 className="font-medium">{t("bulk.currentRights")}</h4>
    <p>{preview.sourceName} · {preview.resourceRevision} · {preview.artifactRevision}</p>
    <p>{detail.rightsReview?.decision === "cleared" ? t("rights.cleared") : t("rights.blocked")} · {detail.rightsReview ? t(`rights.${detail.rightsReview.decision}`) : t("rights.unresolved")}</p>
    {detail.rightsReview ? <div><p>{detail.rightsReview.createdAt} · {detail.rightsReview.actorRole}</p><p>{t("rights.evidence")}: {detail.rightsReview.evidence}</p><p>{t("rights.obligations")}: {detail.rightsReview.obligations}</p></div> : null}
    <fieldset disabled={model.saving || model.canRetry || model.canRetryRights || model.canRetrySelection} className="grid gap-2">
      <legend className="font-medium">{t("bulk.editRights")}</legend>
      <label htmlFor="rights-decision">{t("rights.decision")}</label><select id="rights-decision" className={selectClass} value={form.decision} onChange={(event) => form.changeDecision(event.target.value)}><option value="unresolved">{t("rights.unresolved")}</option><option value="cleared">{t("rights.cleared")}</option><option value="rejected">{t("rights.rejected")}</option></select>
      <label htmlFor="rights-evidence">{t("rights.evidence")}</label><textarea id="rights-evidence" className={selectClass} maxLength={4000} value={form.evidence} onChange={(event) => form.setEvidence(event.target.value)} />
      <label htmlFor="rights-obligations">{t("rights.obligations")}</label><textarea id="rights-obligations" className={selectClass} maxLength={4000} value={form.obligations} onChange={(event) => form.setObligations(event.target.value)} />
    </fieldset>
    {form.invalid ? <Badge variant="danger">{t("rights.invalid")}</Badge> : null}
    <div><Button disabled={model.saving || model.canRetry || model.canRetryRights || model.canRetrySelection} onClick={form.submit}>{t("rights.save")}</Button>{!model.canRetryRights ? <Button variant="outline" disabled={model.saving} onClick={form.reset}>{t("bulk.resetRights")}</Button> : null}{model.canRetryRights ? <Button disabled={model.saving} onClick={form.retry}>{t("editorial.retry")}</Button> : null}</div>
    <div className="grid gap-2 rounded-lg border p-3"><h4 className="font-semibold">{t("rights.preview")}</h4><p>{preview.sourceName} · {preview.sourceEntryId} · {preview.sourceSenseId}</p><p>{preview.resourceRevision} · {preview.artifactRevision} · {preview.artifactSha256}</p><p>{preview.licenseName} {preview.licenseVersion}</p><p>{preview.attributionText}</p><p>{preview.modificationsNotice}</p><div className="flex flex-wrap gap-4">{links.map(({ label, url }) => { const href = safeHttps(url); return href ? <a key={label} className="text-primary underline" href={href} target="_blank" rel="noopener noreferrer">{label}</a> : null; })}</div></div>
  </section>;
}

function ReviewEditor({ detail, save, saving, canRetry }: { detail: Detail; save: Editorial["save"]; saving: boolean; canRetry: boolean }): React.ReactElement {
  const { t } = useAppI18n();
  const form = useEditorialReviewForm(detail, save);
  return (
    <section className="grid gap-3 rounded-lg border p-4" aria-label={t("editorial.edit")}>
      <h3 className="font-semibold">{t("editorial.edit")}</h3>
      <p className="text-sm text-muted-foreground">{t("editorial.editHint")}</p>
      <fieldset disabled={saving || canRetry} className="grid gap-3">
      <label htmlFor="editorial-original">{t("editorial.original")}</label><Input id="editorial-original" value={form.original} maxLength={120} onChange={(event) => form.setOriginal(event.target.value)} />
      <label htmlFor="editorial-definition">{t("editorial.definition")}</label><textarea id="editorial-definition" className={selectClass} maxLength={2000} value={form.definition} onChange={(event) => form.setDefinition(event.target.value)} />
      <label htmlFor="editorial-review">{t("editorial.review")}</label><select id="editorial-review" className={selectClass} value={form.review} onChange={(event) => form.changeReview(event.target.value)}><option value="pending">{t("editorial.pending")}</option><option value="approved">{t("editorial.approved")}</option><option value="rejected">{t("editorial.rejected")}</option></select>
      <label htmlFor="editorial-category">{t("editorial.category")}</label><select id="editorial-category" className={selectClass} value={form.category} onChange={(event) => form.changeCategory(event.target.value)}><option value="common">{t("editorial.common")}</option><option value="regional">{t("editorial.regional")}</option><option value="technical">{t("editorial.technical")}</option><option value="less-common">{t("editorial.lessCommon")}</option><option value="excluded">{t("editorial.excluded")}</option></select>
      <label className="flex items-center gap-2"><input type="checkbox" checked={form.answer} disabled={form.review !== "approved"} onChange={(event) => form.setAnswer(event.target.checked)} />{t("editorial.answerEligible")}</label>
      <fieldset className="grid gap-2"><legend className="font-medium">{t("editorial.checks")}</legend>{checkNames.map((name) => <label className="flex items-center gap-2" key={name}><input type="checkbox" checked={form.checks[name]} onChange={(event) => form.setCheck(name, event.target.checked)} />{t(`editorial.check_${name}`)}</label>)}</fieldset>
      <label htmlFor="editorial-rationale">{t("editorial.rationale")}</label><textarea id="editorial-rationale" className={selectClass} maxLength={2000} value={form.rationale} onChange={(event) => form.setRationale(event.target.value)} />
      </fieldset>
      {form.meaningWarning ? <p role="status">{t("bulk.meaning-warning")}</p> : null}
      {form.meaningWarning && form.answer ? <label className="flex items-center gap-2">
        <Input type="checkbox" className="size-4 shrink-0 p-0" checked={form.warningAcknowledged} disabled={saving || canRetry} onChange={(event) => form.setWarningAcknowledged(event.target.checked)} />
        {t("bulk.confirmMeaningWarning")}
      </label> : null}
      {form.invalid ? <Badge variant="danger">{t("editorial.invalid")}</Badge> : null}
      <div className="flex flex-wrap gap-2"><Button disabled={saving || canRetry || form.answerNeedsAcknowledgement} onClick={form.submit}>{t("editorial.save")}</Button>{canRetry ? <Button disabled={saving} onClick={form.retry}>{t("editorial.retry")}</Button> : null}</div>
    </section>
  );
}

export function CandidateEditorialPanel({ onUnauthorized }: Props): React.ReactElement {
  const { t } = useAppI18n();
  const model = useCandidateEditorial(onUnauthorized);
  const filter = useEditorialFilters(model.applyFilters);
  const enabled = process.env.NEXT_PUBLIC_VTV_IMPORT_ENABLED === "true";
  const bulk = useBulkEditorial(onUnauthorized, enabled);
  const selectedTargets = new Set(bulk.targets.map((item) => item.entryId));
  const pageTargets = model.list?.items.map(({ id, revisionNumber }) => ({ entryId: id, expectedEntryRevision: revisionNumber })) ?? [];
  const newPageTargets = pageTargets.filter((item) => !selectedTargets.has(item.entryId)).length;
  return (
    <Card className="w-full shadow-soft"><CardHeader><CardTitle>{t("editorial.title")}</CardTitle><CardDescription>{t("editorial.description")}</CardDescription></CardHeader><CardContent className="grid gap-4">
      {!enabled ? <p>{t("dictionaryImport.disabled")}</p> : <>
        <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1">{t("editorial.source")}<Input value={filter.sourceId} onChange={(event) => filter.setSourceId(event.target.value)} /></label><label className="grid gap-1">{t("editorial.level")}<select className={selectClass} value={filter.level} onChange={(event) => filter.setLevel(event.target.value)}><option value="">{t("editorial.all")}</option>{[3,5,7,9].map((n) => <option key={n} value={n}>{n}</option>)}</select></label><label className="grid gap-1">{t("editorial.review")}<select className={selectClass} value={filter.review} onChange={(event) => filter.setReview(event.target.value)}><option value="">{t("editorial.all")}</option><option value="pending">{t("editorial.pending")}</option><option value="approved">{t("editorial.approved")}</option><option value="rejected">{t("editorial.rejected")}</option></select></label><label className="grid gap-1">{t("editorial.definition")}<select className={selectClass} value={filter.hasDefinition} onChange={(event) => filter.setHasDefinition(event.target.value)}><option value="">{t("editorial.all")}</option><option value="yes">{t("editorial.yes")}</option><option value="no">{t("editorial.no")}</option></select></label></div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={filter.collisionsOnly} onChange={(event) => filter.setCollisionsOnly(event.target.checked)} />{t("editorial.collisionsOnly")}</label><Button onClick={filter.apply}>{t("editorial.filter")}</Button>
        {model.listLoading ? <p>{t("editorial.loading")}</p> : null}{model.listError ? <Badge variant="danger">{t("editorial.error")}</Badge> : null}
        {!bulk.resume && model.list ? <div className="grid gap-2 rounded-lg border p-3">
          <p aria-live="polite">{t("bulk.selected", { count: bulk.targets.length })}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={bulk.loading || newPageTargets === 0 || bulk.targets.length + newPageTargets > 500} onClick={() => bulk.includePage(pageTargets)}>{t("bulk.selectPage")}</Button>
            <Button variant="outline" disabled={bulk.loading || bulk.targets.length === 0} onClick={bulk.clear}>{t("bulk.clear")}</Button>
            <Button disabled={bulk.loading || bulk.targets.length === 0 || model.saving} onClick={() => { if (model.list) void bulk.start({ filters: model.filters, expectedDraftRevision: model.list.draftRevision, targets: bulk.targets }); }}>{t("bulk.freezeRows")}</Button>
            <Button variant="outline" disabled={bulk.loading || model.saving || pageTargets.length === 0} onClick={() => { if (model.list) void bulk.start({ filters: model.filters, expectedDraftRevision: model.list.draftRevision, targets: null }); }}>{t("bulk.freezeFiltered")}</Button>
          </div>
          {bulk.error ? <p role="alert" className="text-destructive">{t(bulk.error === "REVISION_CONFLICT" ? "bulk.stale" : bulk.error === "VALIDATION_FAILED" ? "bulk.invalidScope" : "bulk.error")}</p> : null}
        </div> : null}
        {bulk.resume ? <BulkEditorialReview model={bulk} openEntry={model.setSelectedEntry} /> : null}
        <ul className="grid gap-2">{model.list?.items.map((item) => <li key={item.id}>
          {!bulk.resume ? <label className="flex items-center gap-2 py-1 text-sm"><Input type="checkbox" className="size-4 shrink-0 p-0" checked={selectedTargets.has(item.id)} disabled={bulk.loading || (bulk.targets.length >= 500 && !selectedTargets.has(item.id))} onChange={() => bulk.toggle({ entryId: item.id, expectedEntryRevision: item.revisionNumber })} />{t("bulk.selectRow", { word: item.original })}</label> : null}
          <Button variant="outline" className="w-full justify-start" onClick={() => model.setSelectedEntry(item.id)}>{item.original} · {item.level} · {t(`editorial.${item.review}`)}{item.collision ? ` · ${t("editorial.collision")}` : ""}</Button><p className="text-sm">{item.definitionVi ?? t("editorial.noDefinition")}</p><p className="break-all text-xs text-muted-foreground">{item.sourceId} · {item.id}</p></li>)}</ul>
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!model.cursor} onClick={() => model.setCursor(null)}>{t("editorial.first")}</Button><Button variant="outline" disabled={!model.list?.nextCursor} onClick={() => model.setCursor(model.list?.nextCursor ?? null)}>{t("editorial.next")}</Button></div>
        {model.detailError ? <Badge variant="danger">{t("editorial.error")}</Badge> : null}
        {model.detail ? <>
          <section className="grid gap-2 rounded-lg border p-4">
            <h3 className="font-semibold">{model.detail.current.original} · {model.detail.current.normalized}</h3>
            <p>{model.detail.source.name} · {model.detail.source.resourceRevision}</p>
            <p className="break-all text-sm">{model.detail.sourceEntryId} {model.detail.sourceSenseId ?? ""}</p>
            <p className="break-all text-sm">SHA-256: {model.detail.source.artifactSha256}</p>
            <p>{model.detail.source.originDump} · {model.detail.source.retrievedAt}</p>
            <p>{model.detail.source.rights.licenseName} {model.detail.source.rights.licenseVersion} · {model.detail.source.rights.attributionText}</p>
            <p>{model.detail.source.rights.redistributionNote}</p><p>{model.detail.source.rights.modificationsNotice}</p><p>{model.detail.sourceNotes}</p>
            <div className="flex flex-wrap gap-4">
              {[{ label: t("editorial.sourceLink"), url: model.detail.entryUrl }, { label: t("editorial.artifactLink"), url: model.detail.source.artifactUrl }, { label: t("editorial.licenseLink"), url: model.detail.source.rights.licenseUrl }, { label: t("editorial.historyLink"), url: model.detail.source.rights.historyUrl }].map(({ label, url }) => { const href = safeHttps(url); return href ? <a key={label} className="text-primary underline" href={href} target="_blank" rel="noopener noreferrer">{label}</a> : null; })}
            </div>
          </section>
          <AnswerCollisionReview model={{ ...model, saving: model.saving || bulk.saving }} normalized={model.detail.current.normalized} level={model.detail.current.level} />
          <RightsEditor key={`${model.detail.sourceId}:${model.detail.draftRevision}`} detail={model.detail} model={{ ...model, saving: model.saving || bulk.saving }} />
          <ReviewEditor key={model.detail.current.id} detail={model.detail} save={model.save} saving={bulk.saving || model.saving || model.canRetryRights || model.canRetrySelection} canRetry={model.canRetry} />
          <section className="grid gap-2"><h3 className="font-semibold">{t("editorial.history")}</h3>
            <ul className="grid gap-2">{model.history?.items.map((item) => <li key={item.id} className="rounded-lg border p-2 text-sm"><p>#{item.revisionNumber} · {item.original} · {t(`editorial.${item.review}`)} · {item.createdAt} · {item.actorRole}</p>{item.bulkBatchId ? <p className="break-all">{t("bulk.batch", { id: item.bulkBatchId })}</p> : null}<p>{item.definitionVi}</p><p>{item.rationale}</p><p>{item.category} · {item.answerEligible ? t("editorial.answerEligible") : ""}</p>{item.exclusionChecks ? <p>{checkNames.map((name) => `${t(`editorial.check_${name}`)}: ${item.exclusionChecks?.[name] ? t("editorial.yes") : t("editorial.no")}`).join(" · ")}</p> : null}</li>)}</ul>
            {model.historyError ? <Badge variant="danger">{t("editorial.error")}</Badge> : null}
            <div className="flex gap-2"><Button variant="outline" onClick={() => model.setHistoryCursor(null)}>{t("editorial.first")}</Button><Button variant="outline" disabled={!model.history?.nextCursor} onClick={() => model.setHistoryCursor(model.history?.nextCursor ?? null)}>{t("editorial.next")}</Button></div>
          </section>
        </> : null}
        {model.saveError ? <Badge variant="danger">{t("editorial.saveError")}</Badge> : null}
      </>}
    </CardContent></Card>
  );
}
