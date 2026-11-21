"use client";

import * as React from "react";
import { hasMeaningWarning, isReviewStatus, parseEditorialRequest, type Category, type ExclusionChecks, type Filters, type ReviewInput, type ReviewStatus } from "@/lib/vua-tieng-viet/editorial-contract";
import type { BulkDecision } from "@/lib/vua-tieng-viet/bulk-review-contract";
import type { useCandidateEditorial } from "@/hooks/useCandidateEditorial";
import { normalizeSpelling } from "@/lib/vua-tieng-viet/dictionary-contract";
import { isUuid } from "@/lib/vua-tieng-viet/publication-contract";

type Editorial = ReturnType<typeof useCandidateEditorial>;
type Detail = NonNullable<Editorial["detail"]>;
const emptyChecks: ExclusionChecks = { names: false, abbreviations: false, offensive: false, malformed: false, unverified: false };

export function useEditorialReviewForm(detail: Detail, save: Editorial["save"]) {
  const [original, setOriginal] = React.useState(detail.current.original);
  const [definition, updateDefinition] = React.useState(detail.current.definitionVi ?? "");
  const [openingClue, setOpeningClue] = React.useState(detail.current.openingClue ?? "");
  const [review, setReview] = React.useState<ReviewStatus>(detail.current.review);
  const [answer, setAnswer] = React.useState(detail.current.answerEligible);
  const [category, setCategory] = React.useState<Category>(detail.current.category ?? "common");
  const [rationale, setRationale] = React.useState(detail.current.rationale ?? "");
  const [checks, setChecks] = React.useState<ExclusionChecks>(detail.current.exclusionChecks ?? emptyChecks);
  const [invalid, setInvalid] = React.useState(false);
  const [baseline, setBaseline] = React.useState(detail.current);
  const [warningAcknowledged, setWarningAcknowledged] = React.useState(false);
  const meaningWarning = hasMeaningWarning(definition);
  const answerNeedsAcknowledgement = meaningWarning && answer && !warningAcknowledged;
  const setDefinition = (value: string) => {
    setWarningAcknowledged(false);
    updateDefinition(value);
  };
  const input: ReviewInput = { entryId: detail.id, expectedEntryRevision: baseline.revisionNumber, expectedDraftRevision: detail.draftRevision, original, definitionVi: definition.trim() ? definition : null, openingClue: openingClue.trim() || null, review, answerEligible: answer, category, rationale, exclusionChecks: checks, ...(meaningWarning && answer && warningAcknowledged ? { meaningWarningAcknowledged: true } : {}) };
  const submit = async (): Promise<boolean> => {
    if (answerNeedsAcknowledgement || stale) return false;
    try {
      parseEditorialRequest({ operation: "review", requestId: "00000000-0000-4000-8000-000000000001", idempotencyKey: "00000000-0000-4000-8000-000000000002", input });
      setInvalid(false);
      return await save(input, false);
    } catch { setInvalid(true); return false; }
  };
  const changeReview = (next: string): void => {
    if (next === "pending" || next === "approved" || next === "rejected") {
      setReview(next);
      if (next !== "approved") setAnswer(false);
    }
  };
  const changeCategory = (next: string): void => {
    if (next === "common" || next === "regional" || next === "technical" || next === "less-common" || next === "rare" || next === "excluded") {
      setCategory(next);
      if (next === "excluded") setAnswer(false);
    }
  };
  const setCheck = (name: keyof ExclusionChecks, checked: boolean): void => setChecks((previous) => ({ ...previous, [name]: checked }));
  const current = detail.current;
  const savedChecks = baseline.exclusionChecks ?? emptyChecks;
  const dirty = original !== baseline.original || definition !== (baseline.definitionVi ?? "") || openingClue !== (baseline.openingClue ?? "") || review !== baseline.review
    || answer !== baseline.answerEligible || category !== (baseline.category ?? "common") || rationale !== (baseline.rationale ?? "")
    || checkKeys.some(key => checks[key] !== savedChecks[key]);
  const stale = dirty && baseline.revisionNumber !== current.revisionNumber;
  const reset = () => {
    setOriginal(current.original);
    updateDefinition(current.definitionVi ?? "");
    setOpeningClue(current.openingClue ?? "");
    setReview(current.review);
    setAnswer(current.answerEligible);
    setCategory(current.category ?? "common");
    setRationale(current.rationale ?? "");
    setChecks(current.exclusionChecks ?? emptyChecks);
    setWarningAcknowledged(false);
    setBaseline(current);
    setInvalid(false);
  };
  if (!dirty && baseline.revisionNumber !== current.revisionNumber) reset();
  let invalidOriginal = false;
  if (invalid) {
    try { invalidOriginal = ![3, 5, 7, 9].includes(normalizeSpelling(original).level); }
    catch { invalidOriginal = true; }
  }
  return { original, setOriginal, definition, setDefinition, openingClue, setOpeningClue, review, changeReview, answer, setAnswer, category, changeCategory, rationale, setRationale, checks, setCheck, invalid, invalidOriginal, dirty, stale, reset, meaningWarning, warningAcknowledged, setWarningAcknowledged, answerNeedsAcknowledgement, submit, retry: () => save(input, true) };
}

const checkKeys: (keyof ExclusionChecks)[] = ["names", "abbreviations", "offensive", "malformed", "unverified"];

export function useEditorialFilters(applyFilters: (filters: Filters) => void) {
  const [spelling, setSpelling] = React.useState("");
  const [sourceId, setSourceId] = React.useState("");
  const [level, setLevel] = React.useState("");
  const [review, setReview] = React.useState("");
  const [hasDefinition, setHasDefinition] = React.useState("");
  const [collisionsOnly, setCollisionsOnly] = React.useState(false);
  const [error, setError] = React.useState<"sourceId" | "spelling" | null>(null);
  const apply = (): void => {
    const selectedLevel = level === "3" ? 3 : level === "5" ? 5 : level === "7" ? 7 : level === "9" ? 9 : null;
    const source = sourceId.trim();
    if (source && !isUuid(source)) { setError("sourceId"); return; }
    try {
      const normalized = normalizeSpelling(spelling.trim().replace(/\s+/g, " ")).normalized;
      setError(null);
      applyFilters({ sourceId: source || null, level: selectedLevel, review: isReviewStatus(review) ? review : null, hasDefinition: hasDefinition === "yes" ? true : hasDefinition === "no" ? false : null, collisionsOnly, ...(normalized ? { spelling: normalized } : {}) });
    } catch { setError("spelling"); }
  };
  const clear = () => {
    setSpelling("");
    setSourceId("");
    setLevel("");
    setReview("");
    setHasDefinition("");
    setCollisionsOnly(false);
    setError(null);
    applyFilters({ sourceId: null, level: null, review: null, hasDefinition: null, collisionsOnly: false });
  };
  return { spelling, setSpelling, sourceId, setSourceId, level, setLevel, review, setReview, hasDefinition, setHasDefinition, collisionsOnly, setCollisionsOnly, error, apply, clear };
}

export const bulkCategories = ["common", "regional", "technical", "less-common", "rare"] as const;

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
  };
  const setCheck = (name: keyof ExclusionChecks, checked: boolean) => setExclusionChecks((current) => ({ ...current, [name]: checked }));
  const dirty = !saved && (category !== "common" || answerEligible || Boolean(rationale) || Object.values(exclusionChecks).some(Boolean));
  const discard = () => { setCategory("common"); setAnswerEligible(false); setRationale(""); setExclusionChecks(emptyChecks); };
  return { decision, canConfirm, changeCategory, setAnswerEligible, setRationale, setCheck, dirty, discard };
}
