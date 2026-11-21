"use client";

import * as React from "react";
import { Badge } from "@/components/atoms/Badge";
import { Button } from "@/components/atoms/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/Card";
import { Checkbox } from "@/components/atoms/Checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/atoms/Dialog";
import { Input } from "@/components/atoms/Input";
import { BulkEditorialReview } from "@/components/molecules/BulkEditorialReview";
import { useBulkEditorial } from "@/hooks/useBulkEditorial";
import { AnswerCollisionReview } from "@/components/molecules/AnswerCollisionReview";
import { CandidateCreationForm } from "@/components/molecules/CandidateCreationForm";
import { useAppI18n } from "@/hooks/useAppI18n";
import { useCandidateEditorial, useRightsReviewForm } from "@/hooks/useCandidateEditorial";
import { useEditorialFilters, useEditorialReviewForm } from "@/hooks/useEditorialForms";
import { useDictionaryDraft, useDictionaryNavigation } from "@/hooks/useDictionaryDraft";
import { useEditorialDetailNavigation } from "@/hooks/useEditorialDetailNavigation";
import type { ExclusionChecks } from "@/lib/vua-tieng-viet/editorial-contract";
import { safeHttps } from "@/lib/vua-tieng-viet/safe-link";

type Props = { onUnauthorized: () => void };
type Editorial = ReturnType<typeof useCandidateEditorial>;
type Detail = NonNullable<Editorial["detail"]>;
const checkNames: (keyof ExclusionChecks)[] = ["names", "abbreviations", "offensive", "malformed", "unverified"];
const selectClass = "w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground";
const disclosureClass = "min-h-11 cursor-pointer py-2 font-medium focus-visible:outline-2 focus-visible:outline-primary";
const actionsClass = "sticky top-0 z-10 flex flex-wrap gap-2 border-b bg-card/95 py-2 backdrop-blur";
const stickyFieldClass = "[&_button]:scroll-mt-20 [&_input]:scroll-mt-20 [&_select]:scroll-mt-20 [&_textarea]:scroll-mt-20";

function EntryLifecycle({ detail, model, guard }: { detail: Detail; model: Editorial; guard: ReturnType<typeof useDictionaryNavigation> }) {
  const { t } = useAppI18n();
  const [confirming, setConfirming] = React.useState(false);
  const current = detail.current;
  const withdrawn = current.review === "withdrawn";
  const locked = model.saving || model.canRetry || model.canRetryRights || model.canRetrySelection;
  const changeStatus = () => {
    setConfirming(false);
    guard(() => {
      const latest = model.latestDetail(detail.id);
      if (!latest || (latest.current.review === "withdrawn") !== withdrawn) return;
      const revision = latest.current;
      void model.save({
        entryId: detail.id, expectedEntryRevision: revision.revisionNumber, expectedDraftRevision: latest.draftRevision,
        original: revision.original, definitionVi: revision.definitionVi, review: withdrawn ? "pending" : "withdrawn",
        answerEligible: false, category: revision.category ?? "common", rationale: revision.rationale ?? "",
        exclusionChecks: revision.exclusionChecks ?? { names: false, abbreviations: false, offensive: false, malformed: false, unverified: false },
      }, false);
    });
  };
  return (
    <section className="grid gap-2 rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{t(withdrawn ? "wordManagement.restoreHint" : "wordManagement.withdrawHint")}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={locked} onClick={withdrawn ? changeStatus : () => setConfirming(true)}>{t(withdrawn ? "wordManagement.restore" : "wordManagement.withdraw")}</Button>
        {withdrawn && model.canRetry ? <Button variant="outline" disabled={model.saving} onClick={model.retryReview}>{t("editorial.retry")}</Button> : null}
      </div>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("wordManagement.confirmWithdraw", { spelling: current.original })}</DialogTitle>
            <DialogDescription>{t("wordManagement.withdrawHint")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" autoFocus onClick={() => setConfirming(false)}>{t("wordManagement.cancel")}</Button>
            <Button variant="danger" disabled={locked} onClick={changeStatus}>{t("wordManagement.withdraw")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function RightsEditor({ detail, model }: { detail: Detail; model: Editorial }): React.ReactElement {
  const { t } = useAppI18n();
  const form = useRightsReviewForm(detail.sourceId, detail.draftRevision, detail.rightsReview, model.saveRights);
  const discard = () => { model.discardRights(); form.reset(); };
  useDictionaryDraft({ dirty: form.dirty, busy: model.saving, save: model.canRetryRights ? form.retry : form.submit, discard });
  const preview = detail.attributionPreview;
  const links = [{ label: t("editorial.sourceLink"), url: preview.entryUrl }, { label: t("editorial.artifactLink"), url: preview.artifactUrl }, { label: t("editorial.licenseLink"), url: preview.licenseUrl }, { label: t("editorial.historyLink"), url: preview.historyUrl }];
  return <section className={`grid min-w-0 gap-3 rounded-lg border p-4 ${stickyFieldClass}`} aria-label={t("rights.title")}>
    <h3 className="font-semibold">{t("rights.title")}</h3>
    <div className={actionsClass}><Button className="min-h-11" disabled={model.saving || model.canRetry || model.canRetryRights || model.canRetrySelection || form.stale} onClick={() => void form.submit()}>{t("rights.save")}</Button><Button className="min-h-11" variant="outline" disabled={model.saving || !form.dirty} onClick={discard}>{t("bulk.resetRights")}</Button>{model.canRetryRights ? <Button className="min-h-11" disabled={model.saving} onClick={() => void form.retry()}>{t("editorial.retry")}</Button> : null}</div>
    <p>{t("rights.claim")}</p>
    <h4 className="font-medium">{t("bulk.currentRights")}</h4>
    <p>{preview.sourceName} · {preview.resourceRevision} · {preview.artifactRevision}</p>
    <p>{detail.rightsReview?.decision === "cleared" ? t("rights.cleared") : t("rights.blocked")} · {detail.rightsReview ? t(`rights.${detail.rightsReview.decision}`) : t("rights.unresolved")}</p>
    {detail.rightsReview ? <div><p>{detail.rightsReview.createdAt} · {detail.rightsReview.actorRole}</p><p>{t("rights.evidence")}: {detail.rightsReview.evidence}</p><p>{t("rights.obligations")}: {detail.rightsReview.obligations}</p></div> : null}
    <fieldset disabled={model.saving || model.canRetry || model.canRetryRights || model.canRetrySelection} className="grid gap-2">
      <legend className="font-medium">{t("bulk.editRights")}</legend>
      <label htmlFor="rights-decision">{t("rights.decision")}</label><select id="rights-decision" className={selectClass} value={form.decision} onChange={(event) => form.changeDecision(event.target.value)}><option value="unresolved">{t("rights.unresolved")}</option><option value="cleared">{t("rights.cleared")}</option><option value="rejected">{t("rights.rejected")}</option></select>
      <label htmlFor="rights-evidence">{t("rights.evidence")}</label><textarea id="rights-evidence" aria-invalid={form.invalid && !form.evidence.trim()} aria-describedby={form.invalid && !form.evidence.trim() ? "rights-evidence-error" : undefined} className={selectClass} maxLength={4000} value={form.evidence} onChange={(event) => form.setEvidence(event.target.value)} />
      {form.invalid && !form.evidence.trim() ? <p role="alert" id="rights-evidence-error" className="text-destructive">{t("editorialWorkspace.fieldRequired")}</p> : null}
      <label htmlFor="rights-obligations">{t("rights.obligations")}</label><textarea id="rights-obligations" aria-invalid={form.invalid && !form.obligations.trim()} aria-describedby={form.invalid && !form.obligations.trim() ? "rights-obligations-error" : undefined} className={selectClass} maxLength={4000} value={form.obligations} onChange={(event) => form.setObligations(event.target.value)} />
      {form.invalid && !form.obligations.trim() ? <p role="alert" id="rights-obligations-error" className="text-destructive">{t("editorialWorkspace.fieldRequired")}</p> : null}
    </fieldset>
    {form.stale ? <p role="alert" className="text-destructive">{t("editorialWorkspace.staleEditor")}</p> : null}
    <div className="grid gap-2 rounded-lg border p-3"><h4 className="font-semibold">{t("rights.preview")}</h4><p>{preview.sourceName} · {preview.sourceEntryId} · {preview.sourceSenseId}</p><p>{preview.resourceRevision} · {preview.artifactRevision} · {preview.artifactSha256}</p><p>{preview.licenseName} {preview.licenseVersion}</p><p>{preview.attributionText}</p><p>{preview.modificationsNotice}</p><div className="flex flex-wrap gap-4">{links.map(({ label, url }) => { const href = safeHttps(url); return href ? <a key={label} className="text-primary underline" href={href} target="_blank" rel="noopener noreferrer">{label}</a> : null; })}</div></div>
  </section>;
}

function ReviewEditor({ detail, save, saving, locked, canRetry, discardReview }: { detail: Detail; save: Editorial["save"]; saving: boolean; locked: boolean; canRetry: boolean; discardReview: Editorial["discardReview"] }): React.ReactElement {
  const { t } = useAppI18n();
  const form = useEditorialReviewForm(detail, save);
  const discard = () => { discardReview(); form.reset(); };
  useDictionaryDraft({ dirty: form.dirty, busy: saving, save: canRetry ? form.retry : form.submit, discard });
  const missingMeaning = form.invalid && form.answer && !form.definition.trim();
  const invalidReview = form.invalid && form.review === "approved" && (!form.rationale.trim() || form.category === "excluded" || !Object.values(form.checks).every(Boolean));
  return (
    <section className={`grid min-w-0 gap-3 rounded-lg border p-4 ${stickyFieldClass}`} aria-label={t("editorial.edit")}>
      <h3 className="font-semibold">{t("editorial.edit")}</h3>
      <div className={actionsClass}><Button className="min-h-11" disabled={saving || locked || canRetry || form.answerNeedsAcknowledgement || form.stale} onClick={() => void form.submit()}>{t("editorial.save")}</Button><Button className="min-h-11" variant="outline" disabled={saving || !form.dirty} onClick={discard}>{t("wordManagement.cancel")}</Button>{canRetry ? <Button className="min-h-11" disabled={saving} onClick={() => void form.retry()}>{t("editorial.retry")}</Button> : null}</div>
      <p className="text-sm text-muted-foreground">{t("editorial.editHint")}</p>
      <fieldset disabled={saving || locked || canRetry} className="grid min-w-0 gap-3">
      <label htmlFor="editorial-original">{t("editorial.original")}</label><Input id="editorial-original" aria-invalid={form.invalidOriginal} aria-describedby={form.invalidOriginal ? "editorial-original-error" : undefined} value={form.original} maxLength={120} onChange={(event) => form.setOriginal(event.target.value)} />
      {form.invalidOriginal ? <p role="alert" id="editorial-original-error" className="text-destructive">{t("wordManagement.invalidSpelling")}</p> : null}
      <label htmlFor="editorial-definition">{t("editorial.definition")}</label><textarea id="editorial-definition" aria-invalid={missingMeaning} aria-describedby={missingMeaning ? "editorial-definition-error" : undefined} className={selectClass} maxLength={2000} value={form.definition} onChange={(event) => form.setDefinition(event.target.value)} />
      <label htmlFor="editorial-opening-clue">{t("editorial.openingClue")}</label>
      <Input id="editorial-opening-clue" maxLength={300} value={form.openingClue} onChange={event => form.setOpeningClue(event.target.value)} aria-describedby="editorial-opening-clue-preview" />
      <p id="editorial-opening-clue-preview" className="break-words text-sm text-muted-foreground">{t("editorial.openingCluePreview")} · {form.openingClue.trim() || form.definition.trim() || t("editorial.noDefinition")}</p>
      {missingMeaning ? <p role="alert" id="editorial-definition-error" className="text-destructive">{t("editorialWorkspace.fieldRequired")}</p> : null}
      <label htmlFor="editorial-review">{t("editorial.review")}</label><select id="editorial-review" className={selectClass} value={form.review} onChange={(event) => form.changeReview(event.target.value)}><option value="pending">{t("editorial.pending")}</option><option value="approved">{t("editorial.approved")}</option><option value="rejected">{t("editorial.rejected")}</option></select>
      <label htmlFor="editorial-category">{t("editorial.category")}</label><select id="editorial-category" className={selectClass} value={form.category} onChange={(event) => form.changeCategory(event.target.value)}><option value="common">{t("editorial.common")}</option><option value="regional">{t("editorial.regional")}</option><option value="technical">{t("editorial.technical")}</option><option value="less-common">{t("editorial.lessCommon")}</option><option value="rare">{t("editorial.rare")}</option><option value="excluded">{t("editorial.excluded")}</option></select>
      <label className="flex items-center gap-2"><Checkbox checked={form.answer} disabled={form.review !== "approved"} onChange={(event) => form.setAnswer(event.target.checked)} />{t("editorial.answerEligible")}</label>
      <fieldset className="grid gap-2"><legend className="font-medium">{t("editorial.checks")}</legend>{checkNames.map((name) => <label className="flex items-center gap-2" key={name}><Checkbox checked={form.checks[name]} onChange={(event) => form.setCheck(name, event.target.checked)} />{t(`editorial.check_${name}`)}</label>)}</fieldset>
      <label htmlFor="editorial-rationale">{t("editorial.rationale")}</label><textarea id="editorial-rationale" className={selectClass} maxLength={2000} value={form.rationale} onChange={(event) => form.setRationale(event.target.value)} />
      {invalidReview ? <p role="alert" className="text-destructive">{t("editorialWorkspace.reviewRequirements")}</p> : null}
      </fieldset>
      {form.meaningWarning ? <p role="status">{t("bulk.meaning-warning")}</p> : null}
      {form.meaningWarning && form.answer ? <label className="flex items-center gap-2">
        <Checkbox checked={form.warningAcknowledged} disabled={saving || locked || canRetry} onChange={(event) => form.setWarningAcknowledged(event.target.checked)} />
        {t("bulk.confirmMeaningWarning")}
      </label> : null}
      {form.stale ? <p role="alert" className="text-destructive">{t("editorialWorkspace.staleEditor")}</p> : null}
    </section>
  );
}

export function CandidateEditorialPanel({ onUnauthorized }: Props): React.ReactElement {
  const { t } = useAppI18n();
  const [creation, setCreation] = React.useState<"unopened" | "open" | "closed">("unopened");
  const showCreate = creation === "open";
  const model = useCandidateEditorial(onUnauthorized);
  const guard = useDictionaryNavigation();
  const filter = useEditorialFilters(filters => guard(() => model.applyFilters(filters)));
  const { desktop, heading, bindMobileSurface, select, close, openFocus, closeFocus } = useEditorialDetailNavigation(model.selected, model.setSelectedEntry);
  const enabled = process.env.NEXT_PUBLIC_VTV_IMPORT_ENABLED === "true";
  const bulk = useBulkEditorial(onUnauthorized, enabled);
  const selectedTargets = new Set(bulk.targets.map((item) => item.entryId));
  const pageTargets = model.list?.items.filter(item => item.review !== 'withdrawn').map(({ id, revisionNumber }) => ({ entryId: id, expectedEntryRevision: revisionNumber })) ?? [];
  const newPageTargets = pageTargets.filter((item) => !selectedTargets.has(item.entryId)).length;
  const appliedFilters = [
    model.filters.spelling,
    model.filters.sourceId,
    model.filters.level !== null ? `${t("editorial.level")} ${model.filters.level}` : null,
    model.filters.review ? t(`editorial.${model.filters.review}`) : null,
    model.filters.hasDefinition !== null ? `${t("editorial.definition")} · ${t(model.filters.hasDefinition ? "editorial.yes" : "editorial.no")}` : null,
    model.filters.collisionsOnly ? t("editorial.collisionsOnly") : null,
  ].filter(Boolean);
  return (
    <Card noAnimate className="w-full min-w-0 shadow-soft"><CardHeader><CardTitle>{t("editorial.title")}</CardTitle><CardDescription>{t("editorial.description")}</CardDescription></CardHeader><CardContent className="grid min-w-0 gap-4">
      {!enabled ? <p>{t("dictionaryImport.disabled")}</p> : <>
        <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="grid min-w-0 gap-4 lg:max-h-[calc(100dvh-12rem)] lg:overflow-y-auto lg:pr-2">
        <form className="grid min-w-0 gap-3" onSubmit={event => { event.preventDefault(); filter.apply(); }}>
          <label className="grid min-w-0 gap-1">{t("wordManagement.search")}<Input className="min-h-11" type="search" value={filter.spelling} maxLength={120} aria-invalid={filter.error === "spelling"} aria-describedby={filter.error === "spelling" ? "filter-spelling-error" : undefined} onChange={event => filter.setSpelling(event.target.value)} /></label>
          {filter.error === "spelling" ? <p role="alert" id="filter-spelling-error" className="text-destructive">{t("editorialWorkspace.invalidSearch")}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button className="min-h-11" type="submit">{t("editorial.filter")}</Button>
            <Button className="min-h-11" variant="outline" onClick={() => guard(filter.clear)}>{t("editorialWorkspace.clearFilters")}</Button>
          </div>
          <details open={filter.error === "sourceId" || undefined}>
          <summary className={disclosureClass}>{t("editorialWorkspace.advancedFilters")}</summary>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <label className="grid min-w-0 gap-1">{t("editorial.source")}<Input value={filter.sourceId} maxLength={36} aria-invalid={filter.error === "sourceId"} aria-describedby={filter.error === "sourceId" ? "filter-source-error" : undefined} onChange={(event) => filter.setSourceId(event.target.value)} /></label>
            {filter.error === "sourceId" ? <p role="alert" id="filter-source-error" className="text-destructive">{t("editorialWorkspace.invalidSourceId")}</p> : null}
            <label className="grid min-w-0 gap-1">{t("editorial.level")}<select className={selectClass} value={filter.level} onChange={(event) => filter.setLevel(event.target.value)}><option value="">{t("editorial.all")}</option>{[3,5,7,9].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
            <label className="grid min-w-0 gap-1">{t("editorial.review")}<select className={selectClass} value={filter.review} onChange={(event) => filter.setReview(event.target.value)}><option value="">{t("editorial.all")}</option><option value="pending">{t("editorial.pending")}</option><option value="approved">{t("editorial.approved")}</option><option value="rejected">{t("editorial.rejected")}</option><option value="withdrawn">{t("editorial.withdrawn")}</option></select></label>
            <label className="grid min-w-0 gap-1">{t("editorial.definition")}<select className={selectClass} value={filter.hasDefinition} onChange={(event) => filter.setHasDefinition(event.target.value)}><option value="">{t("editorial.all")}</option><option value="yes">{t("editorial.yes")}</option><option value="no">{t("editorial.no")}</option></select></label>
          </div>
          <label className="flex min-h-11 items-center gap-2"><Checkbox checked={filter.collisionsOnly} onChange={(event) => filter.setCollisionsOnly(event.target.checked)} />{t("editorial.collisionsOnly")}</label>
          </details>
        </form>
        <div role="status" aria-atomic="true" className="min-w-0 text-sm [overflow-wrap:anywhere]">
          {appliedFilters.length ? <p>{t("editorialWorkspace.appliedFilters")} · {appliedFilters.join(" · ")}</p> : null}
          {model.listLoading ? <p>{t("editorial.loading")}</p> : model.list && !model.listError ? <p>{model.list.items.length ? t("editorialWorkspace.pageCount", { count: model.list.items.length }) : t("wordManagement.noResults")}</p> : null}
        </div>
        {model.listError ? <div role="alert" className="flex flex-wrap items-center gap-2"><p className="text-destructive">{t("editorial.error")}</p><Button className="min-h-11" variant="outline" onClick={() => void model.retryList()}>{t("editorial.retry")}</Button></div> : null}
        <Button className="min-h-11 justify-self-start" variant={showCreate ? "outline" : "primary"} aria-expanded={showCreate} aria-controls={creation === "unopened" ? undefined : "manual-candidate-form"} onClick={() => { if (showCreate) guard(() => setCreation("closed")); else setCreation("open"); }}>
          {t(showCreate ? "wordManagement.hideAdd" : "wordManagement.add")}
        </Button>
        {creation !== "unopened" ? (
          <div hidden={!showCreate}>
            <CandidateCreationForm draftRevision={model.list?.draftRevision} onUnauthorized={onUnauthorized} onSelect={select}
              disabled={bulk.saving || model.saving || model.canRetry || model.canRetryRights || model.canRetrySelection} />
          </div>
        ) : null}
        {!bulk.resume && model.list ? <div className="grid gap-2 rounded-lg border p-3">
          <p aria-live="polite">{t("bulk.selected", { count: bulk.targets.length })}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={bulk.loading || newPageTargets === 0 || bulk.targets.length + newPageTargets > 500} onClick={() => bulk.includePage(pageTargets)}>{t("bulk.selectPage")}</Button>
            <Button variant="outline" disabled={bulk.loading || bulk.targets.length === 0} onClick={bulk.clear}>{t("bulk.clear")}</Button>
            <Button disabled={bulk.loading || model.listLoading || bulk.targets.length === 0 || model.saving} onClick={() => { if (model.list) void bulk.start({ filters: model.filters, expectedDraftRevision: model.list.draftRevision, targets: bulk.targets }); }}>{t("bulk.freezeRows")}</Button>
            <Button variant="outline" disabled={bulk.loading || model.listLoading || model.saving || model.list.items.length === 0} onClick={() => { if (model.list) void bulk.start({ filters: model.filters, expectedDraftRevision: model.list.draftRevision, targets: null }); }}>{t("bulk.freezeFiltered")}</Button>
          </div>
          {bulk.error ? <p role="alert" className="text-destructive">{t(bulk.error === "REVISION_CONFLICT" ? "bulk.stale" : bulk.error === "VALIDATION_FAILED" ? "bulk.invalidScope" : "bulk.error")}</p> : null}
          {bulk.error === "REVISION_CONFLICT" ? <Button className="justify-self-start" variant="outline" onClick={() => { bulk.clear(); void model.retryList(); }}>{t("editorialWorkspace.refreshSelection")}</Button> : null}
        </div> : null}
        {bulk.resume ? <BulkEditorialReview model={bulk} openEntry={select} /> : null}
        <ul className="grid min-w-0 gap-3">{model.list?.items.map((item) => <li className="min-w-0 border-b pb-3 [overflow-wrap:anywhere]" key={item.id}>
          {!bulk.resume && item.review !== 'withdrawn' ? <label className="flex items-center gap-2 py-1 text-sm"><Checkbox checked={selectedTargets.has(item.id)} disabled={bulk.loading || (bulk.targets.length >= 500 && !selectedTargets.has(item.id))} onChange={() => bulk.toggle({ entryId: item.id, expectedEntryRevision: item.revisionNumber })} />{t("bulk.selectRow", { word: item.original })}</label> : null}
          <Button variant={model.selected === item.id ? "secondary" : "outline"} className="h-auto min-h-11 w-full justify-start text-left whitespace-normal" aria-pressed={model.selected === item.id} onClick={event => select(item.id, event.currentTarget)}>{item.original} · {item.level} · {t(`editorial.${item.review}`)}{item.collision ? ` · ${t("editorial.collision")}` : ""}</Button><p className="line-clamp-2 text-sm">{item.definitionVi ?? t("editorial.noDefinition")}</p><p className="break-all text-xs text-muted-foreground">{item.sourceId} · {item.id}</p></li>)}</ul>
        <div className="flex flex-wrap gap-2"><Button className="min-h-11" variant="outline" disabled={!model.cursor} onClick={() => model.setCursor(null)}>{t("editorial.first")}</Button><Button className="min-h-11" variant="outline" disabled={!model.list?.nextCursor} onClick={() => model.setCursor(model.list?.nextCursor ?? null)}>{t("editorial.next")}</Button></div>
        </div>
        {model.selected ? desktop ? (
          <div className="fixed inset-0 z-120 grid min-w-0 content-start gap-3 overflow-y-auto rounded-lg border bg-card p-4 [overflow-wrap:anywhere] lg:static lg:max-h-[calc(100dvh-12rem)]">
            <Button variant="outline" className="min-h-11 justify-self-start lg:hidden" onClick={close}>{t("editorialWorkspace.back")}</Button>
            <h3 ref={heading} tabIndex={-1} className="text-xl font-semibold focus:outline-none">{model.detail?.current.original ?? t("editorialWorkspace.detail")}</h3>
            <CandidateDetail model={model} bulkSaving={bulk.saving} guard={guard} />
          </div>
        ) : (
          <Dialog open onOpenChange={open => { if (!open) close(); }}>
            <DialogContent
              showCloseButton={false}
              aria-describedby={undefined}
              onOpenAutoFocus={openFocus}
              onCloseAutoFocus={closeFocus}
              ref={bindMobileSurface}
              className="fixed top-[var(--editorial-viewport-top,0px)] left-0 flex h-[var(--editorial-viewport-height,100dvh)] max-h-none w-full max-w-full translate-x-0 translate-y-0 flex-col overflow-hidden rounded-none p-0 pt-[env(safe-area-inset-top)] motion-reduce:animate-none"
            >
              <DialogHeader className="shrink-0 border-b px-4 pt-3 pb-2">
                <Button variant="outline" className="min-h-11 self-start" onClick={close}>{t("editorialWorkspace.back")}</Button>
                <DialogTitle ref={heading} tabIndex={-1} className="text-xl [overflow-wrap:anywhere] focus:outline-none">{model.detail?.current.original ?? t("editorialWorkspace.detail")}</DialogTitle>
              </DialogHeader>
              <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] [overflow-wrap:anywhere]">
                <CandidateDetail model={model} bulkSaving={bulk.saving} guard={guard} />
              </div>
            </DialogContent>
          </Dialog>
        ) : null}
        </div>
      </>}
    </CardContent></Card>
  );
}

function CandidateDetail({ model, bulkSaving, guard }: { model: Editorial; bulkSaving: boolean; guard: ReturnType<typeof useDictionaryNavigation> }) {
  const { t } = useAppI18n();
  return <div className="grid min-w-0 gap-3">
    {model.detailLoading ? <p role="status">{t("editorial.loading")}</p> : null}
    {model.detailError ? <div className="flex flex-wrap items-center gap-2" role="alert"><Badge variant="danger">{t("editorial.error")}</Badge><Button variant="outline" onClick={() => void model.retryDetail()}>{t("editorial.retry")}</Button></div> : null}
    {model.detail ? <>
          <div className="grid min-w-0 gap-2">
            <p className="line-clamp-4 whitespace-pre-wrap">{model.detail.current.definitionVi ?? t("editorial.noDefinition")}</p>
            <Badge className="justify-self-start" variant="outline">{t(`editorial.${model.detail.current.review}`)} · {model.detail.current.level}</Badge>
          </div>
          {model.detail.current.review !== "withdrawn" ? <ReviewEditor key={`review:${model.detail.id}:${model.reviewSaves}`} detail={model.detail} save={model.save} discardReview={model.discardReview} saving={bulkSaving || model.saving} locked={model.canRetryRights || model.canRetrySelection} canRetry={model.canRetry} /> : null}
          {model.saveError ? <p role="alert" className="text-destructive">{t("editorial.saveError")}</p> : null}
          <details className="min-w-0 rounded-lg border px-3"><summary className={disclosureClass}>{t("rights.title")}</summary>
            <RightsEditor key={`${model.detail.sourceId}:${model.rightsSaves}`} detail={model.detail} model={{ ...model, saving: model.saving || bulkSaving }} />
          </details>
          <details className="min-w-0 rounded-lg border px-3"><summary className={disclosureClass}>{t("editorialWorkspace.collision")}</summary>
            <AnswerCollisionReview model={{ ...model, saving: model.saving || bulkSaving }} normalized={model.detail.current.normalized} level={model.detail.current.level} />
          </details>
          <details className="min-w-0 rounded-lg border px-3"><summary className={disclosureClass}>{t("editorialWorkspace.sourceDetails")}</summary>
            <section className="grid min-w-0 gap-2 pb-3">
            <p>{model.detail.current.normalized}</p>
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
          </details>
          <EntryLifecycle key={`lifecycle:${model.detail.current.id}`} detail={model.detail} model={{ ...model, saving: model.saving || bulkSaving }} guard={guard} />
          <details className="min-w-0 rounded-lg border px-3"><summary className={disclosureClass}>{t("editorial.history")}</summary>
            <ul className="grid gap-2">{model.history?.items.map((item) => <li key={item.id} className="rounded-lg border p-2 text-sm"><p>#{item.revisionNumber} · {item.original} · {t(`editorial.${item.review}`)} · {item.createdAt} · {item.actorRole}</p>{item.bulkBatchId ? <p className="break-all">{t("bulk.batch", { id: item.bulkBatchId })}</p> : null}<p>{item.definitionVi}</p>{item.openingClue ? <p>{t("wordGame.openingClue")} · {item.openingClue}</p> : null}<p>{item.rationale}</p><p>{item.category} · {item.answerEligible ? t("editorial.answerEligible") : ""}</p>{item.exclusionChecks ? <p>{checkNames.map((name) => `${t(`editorial.check_${name}`)}: ${item.exclusionChecks?.[name] ? t("editorial.yes") : t("editorial.no")}`).join(" · ")}</p> : null}</li>)}</ul>
            {model.historyError ? <Badge variant="danger">{t("editorial.error")}</Badge> : null}
            <div className="flex gap-2"><Button variant="outline" onClick={() => model.setHistoryCursor(null)}>{t("editorial.first")}</Button><Button variant="outline" disabled={!model.history?.nextCursor} onClick={() => model.setHistoryCursor(model.history?.nextCursor ?? null)}>{t("editorial.next")}</Button></div>
          </details>
        </> : null}
  </div>;
}
