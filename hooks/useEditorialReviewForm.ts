"use client";

import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import type { useCandidateEditorial } from "@/hooks/useCandidateEditorial";
import { normalizeSpelling } from "@/lib/vua-tieng-viet/dictionary-contract";
import { hasMeaningWarning, parseEditorialRequest, type ReviewInput } from "@/lib/vua-tieng-viet/editorial-contract";

type Editorial = ReturnType<typeof useCandidateEditorial>;
export type EditorialDetail = Pick<NonNullable<Editorial["detail"]>, "id" | "draftRevision" | "current">;

const fieldText = (max: number) => z.string().refine(value => Array.from(value).length <= max);
const exclusionChecks = z.object({
  names: z.boolean(),
  abbreviations: z.boolean(),
  offensive: z.boolean(),
  malformed: z.boolean(),
  unverified: z.boolean(),
});
export const reviewCheckNames = exclusionChecks.keyof().options;

const schema = z.object({
  expectedEntryRevision: z.number(),
  original: fieldText(120).refine(value => {
    try { return [3, 5, 7, 9].includes(normalizeSpelling(value).level); }
    catch { return false; }
  }),
  definitionVi: fieldText(2000),
  openingClue: fieldText(300),
  review: z.enum(["pending", "approved", "rejected", "withdrawn"]),
  answerEligible: z.boolean(),
  category: z.enum(["common", "regional", "technical", "less-common", "rare", "excluded"]),
  rationale: fieldText(2000),
  exclusionChecks,
}).superRefine((values, ctx) => {
  if (values.answerEligible && !values.definitionVi.trim()) {
    ctx.addIssue({ code: "custom", path: ["definitionVi"], message: "editorialWorkspace.fieldRequired" });
  }
  if (values.review !== "approved") return;
  if (values.category === "excluded") {
    ctx.addIssue({ code: "custom", path: ["category"], message: "editorialWorkspace.reviewRequirements" });
  }
  if (!values.rationale.trim() || !Object.values(values.exclusionChecks).every(Boolean)) {
    ctx.addIssue({ code: "custom", path: ["rationale"], message: "editorialWorkspace.reviewRequirements" });
  }
});

type Fields = z.infer<typeof schema>;

function defaults(current: EditorialDetail["current"]): Fields {
  return {
    expectedEntryRevision: current.revisionNumber,
    original: current.original,
    definitionVi: current.definitionVi ?? "",
    openingClue: current.openingClue ?? "",
    review: current.review,
    answerEligible: current.answerEligible,
    category: current.category ?? "common",
    rationale: current.rationale ?? "",
    exclusionChecks: current.exclusionChecks ?? {
      names: false, abbreviations: false, offensive: false, malformed: false, unverified: false,
    },
  };
}

export function useEditorialReviewForm(detail: EditorialDetail, save: Editorial["save"]) {
  const { control, register, setValue, reset, handleSubmit, getValues, setError, formState } = useForm<Fields>({
    defaultValues: defaults(detail.current),
    resolver: zodResolver(schema),
  });
  const [definition, openingClue, review, answer] = useWatch({
    control, name: ["definitionVi", "openingClue", "review", "answerEligible"],
  });
  const [acknowledgement, setAcknowledgement] = useState<{ definition: string; revision: number } | null>(null);
  const submitting = useRef(false);
  const revision = detail.current.revisionNumber;
  const warningAcknowledged = acknowledgement?.definition === definition && acknowledgement.revision === revision;
  const meaningWarning = hasMeaningWarning(definition);
  const answerNeedsAcknowledgement = meaningWarning && answer && !warningAcknowledged;
  const dirty = formState.isDirty;
  const revisionChanged = formState.defaultValues?.expectedEntryRevision !== detail.current.revisionNumber;
  const stale = dirty && revisionChanged;
  const current = detail.current;
  useEffect(() => {
    if (!dirty && revisionChanged) reset(defaults(current), { keepFieldsRef: true });
  }, [current, dirty, reset, revisionChanged]);

  const inputFor = (values: Fields): ReviewInput => ({
    ...values,
    entryId: detail.id,
    expectedDraftRevision: detail.draftRevision,
    definitionVi: values.definitionVi.trim() ? values.definitionVi : null,
    openingClue: values.openingClue.trim() || null,
    ...(meaningWarning && answer && warningAcknowledged ? { meaningWarningAcknowledged: true } : {}),
  });
  const submit = async () => {
    if (submitting.current || answerNeedsAcknowledgement || stale) return false;
    submitting.current = true;
    let saved = false;
    try {
      await handleSubmit(async values => {
        const input = inputFor(values);
        parseEditorialRequest({ operation: "review", requestId: "00000000-0000-4000-8000-000000000001", idempotencyKey: "00000000-0000-4000-8000-000000000002", input });
        saved = await save(input, false);
      })();
    } catch {
      setError("root", { message: "wordManagement.invalid" });
    } finally {
      submitting.current = false;
    }
    return saved;
  };
  const { onChange: changeDefinition, ...definitionField } = register("definitionVi");
  const { onChange: changeReview, ...reviewField } = register("review");
  const { onChange: changeCategory, ...categoryField } = register("category");

  return {
    register, definition, openingClue, review, answer, dirty, stale, submit, meaningWarning, warningAcknowledged,
    answerNeedsAcknowledgement, errors: formState.errors,
    reset: () => { setAcknowledgement(null); reset(defaults(current), { keepFieldsRef: true }); },
    retry: () => save(inputFor(getValues()), true),
    acknowledgeWarning: (checked: boolean) => setAcknowledgement(checked ? { definition, revision } : null),
    definitionField: { ...definitionField, onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setAcknowledgement(null);
      return changeDefinition(event);
    } },
    reviewField: { ...reviewField, onChange: (event: React.ChangeEvent<HTMLSelectElement>) => {
      const updated = changeReview(event);
      if (event.target.value !== "approved") setValue("answerEligible", false, { shouldDirty: true });
      return updated;
    } },
    categoryField: { ...categoryField, onChange: (event: React.ChangeEvent<HTMLSelectElement>) => {
      const updated = changeCategory(event);
      if (event.target.value === "excluded") setValue("answerEligible", false, { shouldDirty: true });
      return updated;
    } },
  };
}
