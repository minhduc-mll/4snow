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
import {
  formatTicket,
  getDisplayDigits,
  normalizeExceptValues,
  normalizePrizeId,
  parseExceptInput,
  validateDrawConfigInput,
} from "@/hooks/useLuckyDraw";
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
  exceptText: string;
  prizes: PrizeDraft[];
}

const defaultDraft: ConfigDraft = {
  id: "default",
  name: "Lucky Draw",
  from: 0,
  to: 999,
  exceptText: "",
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
    exceptText: config.ticketRange.except.join(", "),
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
      except: parseExceptInput(draft.exceptText),
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
      parseExceptInput(draft.exceptText),
      draft.from,
      draft.to,
    );

    return draft.to - draft.from + 1 - normalizedExcept.length;
  } catch {
    return 0;
  }
}

function ResultGrid({
  winners,
}: {
  winners: string[];
}): React.ReactElement {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {winners.map((winner) => (
        <div
          key={winner}
          className="rounded-lg border bg-background px-3 py-2 text-center font-mono text-lg font-semibold tabular-nums shadow-inner"
        >
          {winner}
        </div>
      ))}
    </div>
  );
}

function HistoryItem({ result }: { result: { prizeName: string; winners: string[]; createdAt: string } }): React.ReactElement {
  return (
    <div className="grid gap-2 rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-foreground">{result.prizeName}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(result.createdAt).toLocaleString()}
          </p>
        </div>
        <Badge variant="success">{result.winners.length} winners</Badge>
      </div>
      <ResultGrid winners={result.winners} />
    </div>
  );
}

export function LuckyDrawAdminPanel(): React.ReactElement {
  const hydrate = useLuckyDrawStore((state) => state.hydrate);
  const config = useLuckyDrawStore((state) => state.config);
  const results = useLuckyDrawStore((state) => state.results);
  const saveConfig = useLuckyDrawStore((state) => state.saveConfig);
  const hydrated = useLuckyDrawStore((state) => state.hydrated);

  const [draftState, setDraftState] = React.useState<ConfigDraft>(defaultDraft);
  const [selectedPrizeIdState, setSelectedPrizeIdState] = React.useState<string | null>(
    defaultDraft.prizes[0]?.id ?? null,
  );
  const [isDirty, setIsDirty] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  React.useEffect(() => {
    hydrate();
  }, [hydrate]);

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
    setDraftState((current) => ({ ...current, ...patch }));
    setIsDirty(true);
    setFormError(null);
  };

  const handlePrizeChange = (index: number, patch: Partial<PrizeDraft>): void => {
    setDraftState((current) => ({
      ...current,
      prizes: current.prizes.map((prize, prizeIndex) =>
        prizeIndex === index ? { ...prize, ...patch } : prize,
      ),
    }));
    setIsDirty(true);
    setFormError(null);
  };

  const handleAddPrize = (): void => {
    setDraftState((current) => {
      const nextOrder = current.prizes.length + 1;
      const prize: PrizeDraft = {
        id: `prize-${nextOrder}`,
        name: `Prize ${nextOrder}`,
        winners_count: 1,
        order: nextOrder,
      };

      return {
        ...current,
        prizes: [...current.prizes, prize],
      };
    });
    setIsDirty(true);
    setFormError(null);
  };

  const handleRemovePrize = (index: number): void => {
    setDraftState((current) => ({
      ...current,
      prizes: current.prizes
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
      setIsDirty(false);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Unable to save Lucky Draw configuration.",
      );
    }
  };

  return (
    <Card className="w-full shadow-soft">
      <CardHeader>
        <CardTitle>Lucky Draw Configuration</CardTitle>
        <CardDescription>
          Configure ticket ranges and prize tiers before opening the draw page.
        </CardDescription>
        <CardAction>
          <Badge variant={isDirty ? "warning" : "success"}>
            {isDirty ? "Unsaved changes" : "Saved config"}
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="grid gap-6">
        <div className="grid gap-3 rounded-lg border bg-muted/20 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1.5 text-sm sm:col-span-3">
              <span className="font-medium text-foreground">Event name</span>
              <Input
                value={draft.name}
                onChange={(event) => handleConfigChange({ name: event.target.value })}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-foreground">From</span>
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
              <span className="font-medium text-foreground">To</span>
              <Input
                type="number"
                min={0}
                value={draft.to}
                onChange={(event) => handleConfigChange({ to: Number(event.target.value) })}
              />
            </label>
            <div className="grid gap-1.5 text-sm">
              <span className="font-medium text-foreground">Derived digits</span>
              <div className="flex h-8 items-center rounded-lg border bg-background px-2.5 text-sm">
                {displayDigits}
              </div>
            </div>
          </div>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-foreground">Except</span>
            <Input
              value={draft.exceptText}
              placeholder="Example: 013, 088, 999"
              onChange={(event) => handleConfigChange({ exceptText: event.target.value })}
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <Badge variant="neutral">Range {rangeLabel}</Badge>
            <Badge variant="neutral">{availableTicketCount} available before history</Badge>
          </div>
        </div>

        <div className="grid gap-3 rounded-lg border bg-muted/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-foreground">Prizes</h2>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Plus className="size-4" aria-hidden />}
              onClick={handleAddPrize}
            >
              Add prize
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
                      {prize.name || `Prize ${index + 1}`}
                    </Button>
                    <div className="flex items-center gap-2">
                      {savedResult ? <Badge variant="success">Drawn</Badge> : null}
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove prize"
                        disabled={draft.prizes.length <= 1}
                        onClick={() => handleRemovePrize(index)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_1fr_140px]">
                    <label className="grid gap-1.5 text-sm">
                      <span className="font-medium text-foreground">Prize ID</span>
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
                      <span className="font-medium text-foreground">Prize name</span>
                      <Input
                        value={prize.name}
                        onChange={(event) =>
                          handlePrizeChange(index, { name: event.target.value })
                        }
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm">
                      <span className="font-medium text-foreground">Winners</span>
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
            <h2 className="text-base font-semibold text-foreground">Previous Results</h2>
          </div>
          {results.length > 0 ? (
            <div className="grid gap-3">
              {results.map((result) => (
                <HistoryItem key={result.id} result={result} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No saved draw results for this configuration yet.
            </p>
          )}
        </div>
      </CardContent>

      <CardFooter className="justify-between gap-3">
        <Button
          variant="outline"
          leftIcon={<Save className="size-4" aria-hidden />}
          onClick={handleSave}
          disabled={validationErrors.length > 0}
        >
          Save config
        </Button>
        <Link href={PATH.luckyDraw}>
          <Button
            variant="secondary"
            disabled={isDirty || validationErrors.length > 0}
          >
            Open draw page
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}
