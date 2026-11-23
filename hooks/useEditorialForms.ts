"use client";

import * as React from "react";
import { isReviewStatus, type ExclusionChecks, type Filters } from "@/lib/vua-tieng-viet/editorial-contract";
import type { BulkDecision } from "@/lib/vua-tieng-viet/bulk-review-contract";
import { normalizeSpelling } from "@/lib/vua-tieng-viet/dictionary-contract";
import { isUuid } from "@/lib/vua-tieng-viet/publication-contract";

const emptyChecks: ExclusionChecks = { names: false, abbreviations: false, offensive: false, malformed: false, unverified: false };

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
