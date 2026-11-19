"use client";

import * as React from "react";
import { hasMeaningWarning, parseEditorialRequest, type Category, type ExclusionChecks, type Filters, type ReviewInput, type ReviewStatus } from "@/lib/vua-tieng-viet/editorial-contract";
import type { BulkDecision } from "@/lib/vua-tieng-viet/bulk-review-contract";
import type { useCandidateEditorial } from "@/hooks/useCandidateEditorial";

type Editorial = ReturnType<typeof useCandidateEditorial>;
type Detail = NonNullable<Editorial["detail"]>;

export function useEditorialReviewForm(detail: Detail, save: Editorial["save"]) {
  const [original, setOriginal] = React.useState(detail.current.original);
  const [definition, updateDefinition] = React.useState(detail.current.definitionVi ?? "");
  const [review, setReview] = React.useState<ReviewStatus>(detail.current.review);
  const [answer, setAnswer] = React.useState(detail.current.answerEligible);
  const [category, setCategory] = React.useState<Category>(detail.current.category ?? "common");
  const [rationale, setRationale] = React.useState(detail.current.rationale ?? "");
  const [checks, setChecks] = React.useState<ExclusionChecks>(detail.current.exclusionChecks ?? { names: false, abbreviations: false, offensive: false, malformed: false, unverified: false });
  const [invalid, setInvalid] = React.useState(false);
  const [warningAcknowledged, setWarningAcknowledged] = React.useState(false);
  const meaningWarning = category === "common" && hasMeaningWarning(definition);
  const answerNeedsAcknowledgement = meaningWarning && answer && !warningAcknowledged;
  const setDefinition = (value: string) => {
    setWarningAcknowledged(false);
    updateDefinition(value);
  };
  const input: ReviewInput = { entryId: detail.id, expectedEntryRevision: detail.current.revisionNumber, expectedDraftRevision: detail.draftRevision, original, definitionVi: definition.trim() ? definition : null, review, answerEligible: answer, category, rationale, exclusionChecks: checks, ...(meaningWarning && answer && warningAcknowledged ? { meaningWarningAcknowledged: true } : {}) };
  const submit = (): void => {
    if (answerNeedsAcknowledgement) return;
    try {
      parseEditorialRequest({ operation: "review", requestId: "00000000-0000-4000-8000-000000000001", idempotencyKey: "00000000-0000-4000-8000-000000000002", input });
      setInvalid(false);
      void save(input, false);
    } catch { setInvalid(true); }
  };
  const changeReview = (next: string): void => {
    if (next === "pending" || next === "approved" || next === "rejected") {
      setReview(next);
      if (next !== "approved") setAnswer(false);
    }
  };
  const changeCategory = (next: string): void => {
    if (next === "common" || next === "regional" || next === "technical" || next === "less-common" || next === "excluded") setCategory(next);
  };
  const setCheck = (name: keyof ExclusionChecks, checked: boolean): void => setChecks((previous) => ({ ...previous, [name]: checked }));
  return { original, setOriginal, definition, setDefinition, review, changeReview, answer, setAnswer, category, changeCategory, rationale, setRationale, checks, setCheck, invalid, meaningWarning, warningAcknowledged, setWarningAcknowledged, answerNeedsAcknowledgement, submit, retry: () => void save(input, true) };
}

export function useEditorialFilters(applyFilters: (filters: Filters) => void) {
  const [sourceId, setSourceId] = React.useState("");
  const [level, setLevel] = React.useState("");
  const [review, setReview] = React.useState("");
  const [hasDefinition, setHasDefinition] = React.useState("");
  const [collisionsOnly, setCollisionsOnly] = React.useState(false);
  const apply = (): void => {
    const selectedLevel = level === "3" ? 3 : level === "5" ? 5 : level === "7" ? 7 : level === "9" ? 9 : null;
    const selectedReview = review === "pending" || review === "approved" || review === "rejected" ? review : null;
    applyFilters({ sourceId: sourceId.trim() || null, level: selectedLevel, review: selectedReview, hasDefinition: hasDefinition === "yes" ? true : hasDefinition === "no" ? false : null, collisionsOnly });
  };
  return { sourceId, setSourceId, level, setLevel, review, setReview, hasDefinition, setHasDefinition, collisionsOnly, setCollisionsOnly, apply };
}

export const bulkCategories = ["common", "regional", "technical", "less-common"] as const;

export function useBulkDecisionForm(saved: BulkDecision | null, error: string | null) {
  const [category, setCategory] = React.useState<BulkDecision["category"]>("common");
  const [answerEligible, setAnswerEligible] = React.useState(false);
  const [rationale, setRationale] = React.useState("");
  const [exclusionChecks, setExclusionChecks] = React.useState<ExclusionChecks>({ names: false, abbreviations: false, offensive: false, malformed: false, unverified: false });
  const decision = saved ?? { category, answerEligible, rationale, exclusionChecks };
  const canConfirm = decision.rationale.trim().length > 0 && Object.values(decision.exclusionChecks).every(Boolean)
    && error !== "REVISION_CONFLICT" && error !== "IDEMPOTENCY_CONFLICT" && error !== "VALIDATION_FAILED";
  const changeCategory = (value: string) => {
    const selected = bulkCategories.find((category) => category === value);
    if (!selected) return;
    setCategory(selected);
    if (selected !== "common") setAnswerEligible(false);
  };
  const setCheck = (name: keyof ExclusionChecks, checked: boolean) => setExclusionChecks((current) => ({ ...current, [name]: checked }));
  return { decision, canConfirm, changeCategory, setAnswerEligible, setRationale, setCheck };
}
