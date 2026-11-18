"use client";

import * as React from "react";
import { formatTicket, getDisplayDigits, normalizeExceptValues, normalizePrizeId, validateDrawConfigInput } from "@/hooks/useLuckyDraw";
import { useAppI18n } from "@/hooks/useAppI18n";
import { useUnsavedAdminChanges } from "@/hooks/useUnsavedAdminChanges";
import { useLuckyDrawStore } from "@/stores/useLuckyDrawStore";
import type { LuckyDrawConfig, LuckyDrawPrize } from "@/types/lucky-draw";

type PrizeDraft = LuckyDrawPrize;
type Confirmation = { kind: "prize"; index: number; name: string } | { kind: "results" };

interface ConfigDraft {
  id: string;
  name: string;
  from: number;
  to: number;
  except: string[];
  prizes: PrizeDraft[];
}

const defaultDraft: ConfigDraft = {
  id: "default",
  name: "Lucky Draw",
  from: 0,
  to: 999,
  except: [],
  prizes: [
    {
      id: "first_prize",
      name: "First Prize",
      winners_count: 1,
      order: 1,
    },
  ],
};

function toDraft(config: LuckyDrawConfig): ConfigDraft {
  return {
    id: config.id,
    name: config.name,
    from: config.ticketRange.from,
    to: config.ticketRange.to,
    except: [...config.ticketRange.except],
    prizes: [...config.prizes].sort((left, right) => left.order - right.order),
  };
}

function toConfig(draft: ConfigDraft): LuckyDrawConfig {
  const prizes = draft.prizes.map((prize, index) => ({
    id: prize.id || normalizePrizeId(prize.name, index + 1),
    name: prize.name.trim(),
    winners_count: Math.trunc(prize.winners_count),
    order: index + 1,
  }));

  return {
    id: draft.id || "default",
    name: draft.name.trim() || "Lucky Draw",
    ticketRange: {
      from: draft.from,
      to: draft.to,
      except: draft.except,
    },
    prizes,
  };
}

function getDraftAvailableTicketCount(draft: ConfigDraft): number | null {
  if (
    !Number.isInteger(draft.from) ||
    !Number.isInteger(draft.to) ||
    draft.from > draft.to
  ) {
    return null;
  }

  try {
    const normalizedExcept = normalizeExceptValues(
      draft.except,
      draft.from,
      draft.to,
    );

    return draft.to - draft.from + 1 - normalizedExcept.length;
  } catch {
    return null;
  }
}

export function useLuckyDrawAdmin() {
  const hydrate = useLuckyDrawStore((state) => state.hydrate);
  const config = useLuckyDrawStore((state) => state.config);
  const results = useLuckyDrawStore((state) => state.results);
  const saveConfig = useLuckyDrawStore((state) => state.saveConfig);
  const clearAllResults = useLuckyDrawStore((state) => state.clearAllResults);
  const { t } = useAppI18n();
  const hydrated = useLuckyDrawStore((state) => state.hydrated);

  const [draftState, setDraftState] = React.useState<ConfigDraft>(defaultDraft);
  const [openPrizeIndex, setOpenPrizeIndex] = React.useState<number | null>(0);
  const [confirmation, setConfirmation] = React.useState<Confirmation | null>(null);
  const [resultsError, setResultsError] = React.useState<string | null>(null);
  const [isDirty, setIsDirty] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [showSaveSuccess, setShowSaveSuccess] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  useUnsavedAdminChanges(isDirty, t("luckyDrawUX.leaveWarning"));

  React.useEffect(() => {
    hydrate();
  }, [hydrate]);

  React.useEffect(() => {
    if (!showSaveSuccess) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setShowSaveSuccess(false);
    }, 2500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [showSaveSuccess]);

  const draft = React.useMemo<ConfigDraft>(() => {
    if (!hydrated || isDirty) {
      return draftState;
    }

    return toDraft(config);
  }, [config, draftState, hydrated, isDirty]);

  const displayDigits = getDisplayDigits(draft.to);
  const rangeLabel = `${formatTicket(draft.from, displayDigits)} - ${formatTicket(
    draft.to,
    displayDigits,
  )}`;
  const availableTicketCount = getDraftAvailableTicketCount(draft);
  const validationErrors = validateDrawConfigInput(toConfig(draft));
  const seenPrizeIds = new Set<string>();
  const duplicatePrizeIds = new Set<string>();
  for (const prize of draft.prizes) {
    if (seenPrizeIds.has(prize.id)) duplicatePrizeIds.add(prize.id);
    seenPrizeIds.add(prize.id);
  }
  const hasValidationErrors = validationErrors.length > 0 || duplicatePrizeIds.size > 0;
  const rangeInvalid = !Number.isInteger(draft.from) || !Number.isInteger(draft.to) || draft.from < 0 || draft.to < 0 || draft.from > draft.to;
  const exclusionInvalid = validationErrors.some((error) => error.startsWith("Invalid exclusion list"));
  const totalTickets = !rangeInvalid && Number.isSafeInteger(draft.to - draft.from + 1) ? draft.to - draft.from + 1 : null;
  const previousWinners = new Set(results.flatMap((result) => result.winners));
  const excluded = new Set(config.ticketRange.except);
  const previousEligible = [...previousWinners].filter((ticket) => !excluded.has(ticket)).length;
  const eligibleTickets = hydrated && !isDirty && availableTicketCount !== null && totalTickets !== null ? availableTicketCount - previousEligible : null;

  const handleConfigChange = (patch: Partial<ConfigDraft>): void => {
    setDraftState((current) => ({ ...(isDirty ? current : draft), ...patch }));
    setIsDirty(true);
    setShowSaveSuccess(false);
    setFormError(null);
  };

  const handlePrizeChange = (index: number, patch: Partial<PrizeDraft>): void => {
    const baseDraft = draft;
    setDraftState((current) => ({
      ...(isDirty ? current : baseDraft),
      prizes: (isDirty ? current : baseDraft).prizes.map((prize, prizeIndex) =>
        prizeIndex === index ? { ...prize, ...patch } : prize,
      ),
    }));
    setIsDirty(true);
    setShowSaveSuccess(false);
    setFormError(null);
  };

  const handleAddPrize = (): void => {
    const baseDraft = draft;
    setOpenPrizeIndex(baseDraft.prizes.length);
    setDraftState((current) => {
      const workingDraft = isDirty ? current : baseDraft;
      const nextOrder = workingDraft.prizes.length + 1;
      const ids = new Set(workingDraft.prizes.map((item) => item.id));
      let nextId = nextOrder;
      while (ids.has(`prize-${nextId}`)) nextId += 1;
      const prize: PrizeDraft = {
        id: `prize-${nextId}`,
        name: `${t("luckyDraw.prize")} ${nextOrder}`,
        winners_count: 1,
        order: nextOrder,
      };

      return {
        ...workingDraft,
        prizes: [...workingDraft.prizes, prize],
      };
    });
    setIsDirty(true);
    setShowSaveSuccess(false);
    setFormError(null);
  };

  const handleRemovePrize = (index: number): void => {
    const baseDraft = draft;
    setDraftState((current) => ({
      ...(isDirty ? current : baseDraft),
      prizes: (isDirty ? current : baseDraft).prizes
        .filter((_, prizeIndex) => prizeIndex !== index)
        .map((prize, prizeIndex) => ({ ...prize, order: prizeIndex + 1 })),
    }));
    setIsDirty(true);
    setShowSaveSuccess(false);
    setFormError(null);
    setOpenPrizeIndex((current) => current === null ? null : current === index ? null : current > index ? current - 1 : current);
  };

  const handleSave = async (): Promise<void> => {
    setFormError(null);
    setSaving(true);

    try {
      const nextConfig = toConfig(draft);
      saveConfig(nextConfig);
      const nextDraft = toDraft(nextConfig);
      setDraftState(nextDraft);
      setIsDirty(false);
      setShowSaveSuccess(true);
    } catch {
      setShowSaveSuccess(false);
      setFormError(t("luckyDrawUX.storageError"));
    } finally {
      setSaving(false);
    }
  };

  return { t, results, clearAllResults, draft, setDraftState, openPrizeIndex, setOpenPrizeIndex, confirmation, setConfirmation, resultsError, setResultsError, isDirty, setIsDirty, formError, showSaveSuccess, setShowSaveSuccess, saving, displayDigits, rangeLabel, rangeInvalid, exclusionInvalid, totalTickets, eligibleTickets, validationErrors, duplicatePrizeIds, hasValidationErrors, handleConfigChange, handlePrizeChange, handleAddPrize, handleRemovePrize, handleSave };
}
