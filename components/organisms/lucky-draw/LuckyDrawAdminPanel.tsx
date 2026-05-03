"use client";

import Link from "next/link";
import * as React from "react";
import { History, Plus, Save, Trash2 } from "lucide-react";

import { Badge } from "@/components/atoms/Badge";
import { Button } from "@/components/atoms/Button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/atoms/Card";
import { Input } from "@/components/atoms/Input";
import { ExceptTagsInput } from "@/components/molecules/lucky-draw/ExceptTagsInput";
import {
  formatTicket,
  getDisplayDigits,
  normalizeExceptValues,
  normalizePrizeId,
  validateDrawConfigInput,
} from "@/hooks/useLuckyDraw";
import { DrawHistoryItem } from "@/components/molecules/lucky-draw/DrawHistoryItem";
import { useAppI18n } from "@/hooks/useAppI18n";
import { useLuckyDrawStore } from "@/stores/useLuckyDrawStore";
import { PATH } from "@/lib/paths";
import { cn } from "@/lib/utils";
import type { LuckyDrawConfig, LuckyDrawPrize } from "@/types/lucky-draw";

type PrizeDraft = LuckyDrawPrize;

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
    id: normalizePrizeId(prize.id || prize.name, index + 1),
    name: prize.name.trim(),
    winners_count: Math.trunc(prize.winners_count),
    order: index + 1,
  }));

  return {
    id: draft.id || "default",
    name: draft.name.trim() || "Lucky Draw",
    ticketRange: {
      from: Math.trunc(draft.from),
      to: Math.trunc(draft.to),
      except: draft.except,
    },
    prizes,
  };
}

function getDraftAvailableTicketCount(draft: ConfigDraft): number {
  if (
    !Number.isInteger(draft.from) ||
    !Number.isInteger(draft.to) ||
    draft.from > draft.to
  ) {
    return 0;
  }

  try {
    const normalizedExcept = normalizeExceptValues(
      draft.except,
      draft.from,
      draft.to,
    );

    return draft.to - draft.from + 1 - normalizedExcept.length;
  } catch {
    return 0;
  }
}

export function LuckyDrawAdminPanel(): React.ReactElement {
  const hydrate = useLuckyDrawStore((state) => state.hydrate);
  const config = useLuckyDrawStore((state) => state.config);
  const results = useLuckyDrawStore((state) => state.results);
  const saveConfig = useLuckyDrawStore((state) => state.saveConfig);
  const clearAllResults = useLuckyDrawStore((state) => state.clearAllResults);
  const { t } = useAppI18n();
  const hydrated = useLuckyDrawStore((state) => state.hydrated);

  const [draftState, setDraftState] = React.useState<ConfigDraft>(defaultDraft);
  const [selectedPrizeIdState, setSelectedPrizeIdState] = React.useState<string | null>(
    defaultDraft.prizes[0]?.id ?? null,
  );
  const [isDirty, setIsDirty] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [showSaveSuccess, setShowSaveSuccess] = React.useState(false);

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

  const selectedPrizeId = React.useMemo<string | null>(() => {
    if (!hydrated || isDirty) {
      return selectedPrizeIdState;
    }

    if (
      selectedPrizeIdState &&
      draft.prizes.some((prize) => prize.id === selectedPrizeIdState)
    ) {
      return selectedPrizeIdState;
    }

    return draft.prizes[0]?.id ?? null;
  }, [draft, hydrated, isDirty, selectedPrizeIdState]);

  const displayDigits = getDisplayDigits(draft.to);
  const rangeLabel = `${formatTicket(draft.from, displayDigits)} - ${formatTicket(
    draft.to,
    displayDigits,
  )}`;
  const availableTicketCount = getDraftAvailableTicketCount(draft);
  const validationErrors = validateDrawConfigInput(toConfig(draft));

  const handleConfigChange = (patch: Partial<ConfigDraft>): void => {
    setDraftState((current) => ({ ...(isDirty ? current : draft), ...patch }));
    setIsDirty(true);
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
    setFormError(null);
  };

  const handleAddPrize = (): void => {
    const baseDraft = draft;
    setDraftState((current) => {
      const workingDraft = isDirty ? current : baseDraft;
      const nextOrder = workingDraft.prizes.length + 1;
      const prize: PrizeDraft = {
        id: `prize-${nextOrder}`,
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
    setFormError(null);
  };

  const handleSave = async (): Promise<void> => {
    setFormError(null);

    try {
      const nextConfig = toConfig(draft);
      saveConfig(nextConfig);
      const nextDraft = toDraft(nextConfig);
      setDraftState(nextDraft);
      setSelectedPrizeIdState((current) =>
        current && nextDraft.prizes.some((prize) => prize.id === current)
          ? current
          : (nextDraft.prizes[0]?.id ?? null),
      );
      setIsDirty(false);
      setShowSaveSuccess(true);
    } catch (error) {
      setShowSaveSuccess(false);
      setFormError(
        error instanceof Error
          ? error.message
          : "Unable to save Lucky Draw configuration.",
      );
    }
  };

  return (
    <Card className="w-full shadow-soft">
      {showSaveSuccess ? (
        <div className="pointer-events-none fixed right-4 top-4 z-40 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-800 shadow-lg dark:text-emerald-200">
          {t("luckyDraw.configSavedSuccess")}
        </div>
      ) : null}
      <CardHeader>
        <CardTitle>{t("luckyDraw.luckyDraw")}</CardTitle>
        <CardDescription>{t("luckyDraw.openDrawPage")}</CardDescription>
        <CardAction>
          <Badge variant={isDirty ? "warning" : "success"}>
            {isDirty ? t("luckyDraw.unsavedChanges") : t("luckyDraw.savedConfig")}
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="grid gap-6">
        <div className="grid gap-3 rounded-lg border bg-muted/20 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1.5 text-sm sm:col-span-3">
              <span className="font-medium text-foreground">{t("luckyDraw.eventName")}</span>
              <Input
                value={draft.name}
                onChange={(event) => handleConfigChange({ name: event.target.value })}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-foreground">{t("luckyDraw.from")}</span>
              <Input
                type="number"
                min={0}
                value={draft.from}
                onChange={(event) =>
                  handleConfigChange({ from: Number(event.target.value) })
                }
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-foreground">{t("luckyDraw.to")}</span>
              <Input
                type="number"
                min={0}
                value={draft.to}
                onChange={(event) => handleConfigChange({ to: Number(event.target.value) })}
              />
            </label>
            <div className="grid gap-1.5 text-sm">
              <span className="font-medium text-foreground">{t("luckyDraw.derivedDigits")}</span>
              <div className="flex h-8 items-center rounded-lg border bg-background px-2.5 text-sm">
                {displayDigits}
              </div>
            </div>
          </div>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-foreground">{t("luckyDraw.except")}</span>
            <ExceptTagsInput
              value={draft.except}
              placeholder={t("luckyDraw.exceptPlaceholder")}
              onChange={(nextExcept) => handleConfigChange({ except: nextExcept })}
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <Badge variant="neutral">{t("luckyDraw.from")} {rangeLabel}</Badge>
            <Badge variant="neutral">{availableTicketCount}</Badge>
          </div>
        </div>

        <div className="grid gap-3 rounded-lg border bg-muted/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-foreground">{t("luckyDraw.prizes")}</h2>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Plus className="size-4" aria-hidden />}
              onClick={handleAddPrize}
            >
              {t("luckyDraw.addPrize")}
            </Button>
          </div>

          <div className="grid gap-3">
            {draft.prizes.map((prize, index) => {
              const savedResult = results.find((result) => result.prizeId === prize.id);
              const isSelected = selectedPrizeId === prize.id;

              return (
                <div
                  key={`${prize.order}-${index}`}
                  className={cn(
                    "grid gap-3 rounded-lg border bg-background p-3",
                    isSelected ? "ring-2 ring-primary/40" : null,
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button
                      variant="ghost"
                      className="justify-start px-0 text-left font-medium text-foreground"
                      onClick={() => setSelectedPrizeIdState(prize.id)}
                    >
                      {prize.name || `${t("luckyDraw.prize")} ${index + 1}`}
                    </Button>
                    <div className="flex items-center gap-2">
                      {savedResult ? <Badge variant="success">{t("luckyDraw.drawn")}</Badge> : null}
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("luckyDraw.removePrize")}
                        disabled={draft.prizes.length <= 1}
                        onClick={() => handleRemovePrize(index)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_1fr_140px]">
                    <label className="grid gap-1.5 text-sm">
                      <span className="font-medium text-foreground">{t("luckyDraw.prizeId")}</span>
                      <Input
                        value={prize.id}
                        onChange={(event) =>
                          handlePrizeChange(index, {
                            id: normalizePrizeId(event.target.value, index + 1),
                          })
                        }
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm">
                      <span className="font-medium text-foreground">{t("luckyDraw.prizeName")}</span>
                      <Input
                        value={prize.name}
                        onChange={(event) =>
                          handlePrizeChange(index, { name: event.target.value })
                        }
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm">
                      <span className="font-medium text-foreground">{t("luckyDraw.winnersCount")}</span>
                      <Input
                        type="number"
                        min={1}
                        value={prize.winners_count}
                        onChange={(event) =>
                          handlePrizeChange(index, {
                            winners_count: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {(formError || validationErrors.length > 0) ? (
          <div className="grid gap-2">
            {formError ? (
              <Badge variant="danger" className="w-fit">
                {formError}
              </Badge>
            ) : null}
            {validationErrors.map((error) => (
              <Badge key={error} variant="danger" className="w-fit">
                {error}
              </Badge>
            ))}
          </div>
        ) : null}

        <div className="grid gap-3 rounded-lg border bg-muted/20 p-4">
          <div className="flex items-center gap-2">
            <History className="size-4" aria-hidden />
            <h2 className="text-base font-semibold text-foreground">{t("luckyDraw.previousResults")}</h2>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("luckyDraw.clearAllResults")}
              disabled={results.length === 0}
              onClick={clearAllResults}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
          {results.length > 0 ? (
            <div className="grid gap-3">
              {results.map((result) => (
                <DrawHistoryItem key={result.id} result={result} compact={false} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("luckyDraw.noSavedResults")}
            </p>
          )}
        </div>
      </CardContent>

      <CardFooter className="justify-end gap-3">
        <Link href={PATH.luckyDraw}>
          <Button
            variant="outline"
            disabled={isDirty || validationErrors.length > 0}
          >
            {t("luckyDraw.openDrawPage")}
          </Button>
        </Link>
        <Button
          variant="primary"
          leftIcon={<Save className="size-4" aria-hidden />}
          onClick={handleSave}
          disabled={validationErrors.length > 0}
        >
          {t("luckyDraw.saveConfig")}
        </Button>
      </CardFooter>
    </Card>
  );
}
