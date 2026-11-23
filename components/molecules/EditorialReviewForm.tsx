"use client";

import { Button } from "@/components/atoms/Button";
import { Checkbox } from "@/components/atoms/Checkbox";
import { Input } from "@/components/atoms/Input";
import { useAppI18n } from "@/hooks/useAppI18n";
import { useDictionaryDraft } from "@/hooks/useDictionaryDraft";
import { reviewCheckNames, useEditorialReviewForm, type EditorialDetail } from "@/hooks/useEditorialReviewForm";
import type { ReviewInput } from "@/lib/vua-tieng-viet/editorial-contract";

type Props = {
  detail: EditorialDetail;
  save: (input: ReviewInput, retry: boolean) => Promise<boolean>;
  saving: boolean;
  locked: boolean;
  canRetry: boolean;
  discardReview: () => void;
};

const controlClass = "min-h-11 w-full rounded-md border bg-background px-3 py-2 text-base text-foreground sm:text-sm";

export function ReviewEditor({ detail, save, saving, locked, canRetry, discardReview }: Props) {
  const { t } = useAppI18n();
  const form = useEditorialReviewForm(detail, save);
  const { errors, register } = form;
  const disabled = saving || locked || canRetry;
  const discard = () => { discardReview(); form.reset(); };
  useDictionaryDraft({ dirty: form.dirty, busy: saving, save: canRetry ? form.retry : form.submit, discard });
  const fieldError = (field: keyof typeof errors, message: string) => errors[field]
    ? <p role="alert" id={`editorial-${field}-error`} className="text-sm text-destructive">{t(message)}</p>
    : null;
  const invalid = (field: keyof typeof errors, description?: string) => ({
    "aria-invalid": Boolean(errors[field]),
    "aria-describedby": [description, errors[field] ? `editorial-${field}-error` : undefined].filter(Boolean).join(" ") || undefined,
  });

  return (
    <section aria-label={t("editorial.edit")}>
      <form noValidate
        onSubmit={event => { event.preventDefault(); if (!disabled) void form.submit(); }}
        className="grid min-w-0 gap-3 rounded-lg border p-4 [&_input]:scroll-mt-24 [&_select]:scroll-mt-24 [&_textarea]:scroll-mt-24">
        <h3 className="font-semibold">{t("editorial.edit")}</h3>
        <div className="sticky top-0 z-10 flex flex-wrap gap-2 border-b bg-card/95 py-2 backdrop-blur">
          <Button type="submit" className="min-h-11" disabled={disabled || form.answerNeedsAcknowledgement || form.stale}>{t("editorial.save")}</Button>
          <Button className="min-h-11" variant="outline" disabled={saving || !form.dirty} onClick={discard}>{t("wordManagement.cancel")}</Button>
          {canRetry ? <Button className="min-h-11" disabled={saving} onClick={() => void form.retry()}>{t("editorial.retry")}</Button> : null}
        </div>
        <p className="text-sm text-muted-foreground">{t("editorial.editHint")}</p>
        <fieldset disabled={disabled} className="grid min-w-0 gap-3">
          <label htmlFor="editorial-original">{t("editorial.original")}</label>
          <Input id="editorial-original" className="min-h-11 text-base sm:text-sm" maxLength={120}
            {...register("original")} {...invalid("original")} />
          {fieldError("original", "wordManagement.invalidSpelling")}

          <label htmlFor="editorial-definition">{t("editorial.definition")}</label>
          <textarea id="editorial-definition" className={controlClass} maxLength={2000} {...form.definitionField} {...invalid("definitionVi")} />
          {fieldError("definitionVi", errors.definitionVi?.message === "editorialWorkspace.fieldRequired" ? "editorialWorkspace.fieldRequired" : "wordManagement.invalid")}

          <label htmlFor="editorial-opening-clue">{t("editorial.openingClue")}</label>
          <Input id="editorial-opening-clue" className="min-h-11 text-base sm:text-sm" maxLength={300}
            {...register("openingClue")} {...invalid("openingClue", "editorial-opening-clue-preview")} />
          {fieldError("openingClue", "wordManagement.invalid")}
          <p id="editorial-opening-clue-preview" className="break-words text-sm text-muted-foreground">
            {t("editorial.openingCluePreview")} · {form.openingClue.trim() || form.definition.trim() || t("editorial.noDefinition")}
          </p>

          <label htmlFor="editorial-review">{t("editorial.review")}</label>
          <select id="editorial-review" className={controlClass} {...form.reviewField}>
            <option value="pending">{t("editorial.pending")}</option>
            <option value="approved">{t("editorial.approved")}</option>
            <option value="rejected">{t("editorial.rejected")}</option>
          </select>
          <label htmlFor="editorial-category">{t("editorial.category")}</label>
          <select id="editorial-category" className={controlClass} {...form.categoryField} {...invalid("category")}>
            <option value="common">{t("editorial.common")}</option>
            <option value="regional">{t("editorial.regional")}</option>
            <option value="technical">{t("editorial.technical")}</option>
            <option value="less-common">{t("editorial.lessCommon")}</option>
            <option value="rare">{t("editorial.rare")}</option>
            <option value="excluded">{t("editorial.excluded")}</option>
          </select>
          {fieldError("category", "editorialWorkspace.reviewRequirements")}
          <label className="flex min-h-11 w-fit items-center gap-2">
            <Checkbox {...register("answerEligible")} disabled={form.review !== "approved"} />
            {t("editorial.answerEligible")}
          </label>
          <fieldset className="grid gap-2">
            <legend className="font-medium">{t("editorial.checks")}</legend>
            {reviewCheckNames.map(name => (
              <label className="flex min-h-11 w-fit items-center gap-2" key={name}>
                <Checkbox {...register(`exclusionChecks.${name}`)} />
                {t(`editorial.check_${name}`)}
              </label>
            ))}
          </fieldset>
          <label htmlFor="editorial-rationale">{t("editorial.rationale")}</label>
          <textarea id="editorial-rationale" className={controlClass} maxLength={2000} {...register("rationale")} {...invalid("rationale")} />
          {fieldError("rationale", errors.rationale?.message === "editorialWorkspace.reviewRequirements" ? "editorialWorkspace.reviewRequirements" : "wordManagement.invalid")}
        </fieldset>
        {form.meaningWarning ? <p role="status">{t("bulk.meaning-warning")}</p> : null}
        {form.meaningWarning && form.answer ? (
          <label className="flex min-h-11 w-fit items-center gap-2">
            <Checkbox checked={form.warningAcknowledged} disabled={disabled} onChange={event => form.acknowledgeWarning(event.target.checked)} />
            {t("bulk.confirmMeaningWarning")}
          </label>
        ) : null}
        {fieldError("root", "wordManagement.invalid")}
        {form.stale ? <p role="alert" className="text-destructive">{t("editorialWorkspace.staleEditor")}</p> : null}
      </form>
    </section>
  );
}
