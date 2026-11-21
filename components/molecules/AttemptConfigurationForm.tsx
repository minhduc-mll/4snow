"use client";

import { useEffect } from "react";
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { useAppI18n } from "@/hooks/useAppI18n";
import { useAttemptLimitInput } from "@/hooks/useAttemptLimitInput";
import { useDictionaryDraft } from "@/hooks/useDictionaryDraft";
import type { DraftConfiguration } from "@/lib/vua-tieng-viet/publication-response";

type Props = { configuration: DraftConfiguration; disabled: boolean; busy: boolean; onDirtyChange: (dirty: boolean) => void; onSave: (attempts: number, initialAbsentCount: number) => Promise<boolean>; onDiscard: () => void };
export function AttemptConfigurationForm({ configuration, disabled, busy, onDirtyChange, onSave, onDiscard }: Props) {
  const { t } = useAppI18n();
  const model = useAttemptLimitInput(configuration.configuration.attemptLimit);
  const clues = useAttemptLimitInput(configuration.configuration.initialAbsentCount ?? 0, 0, 17);
  const dirty = !model.valid || !clues.valid || model.changed || clues.changed;
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  const save = () => model.valid && clues.valid ? onSave(model.value, clues.value) : Promise.resolve(false);
  useDictionaryDraft({
    dirty,
    busy,
    save,
    discard: () => {
      model.setInput(String(configuration.configuration.attemptLimit));
      clues.setInput(String(configuration.configuration.initialAbsentCount ?? 0));
      onDirtyChange(false);
      onDiscard();
    },
  });
  const canSave = model.valid && clues.valid && dirty && !disabled;
  return <section aria-label={t("attemptConfiguration.title")} className="grid gap-3 rounded-lg border p-4">
    <h3 className="font-semibold">{t("attemptConfiguration.title")}</h3>
    <p className="text-sm text-muted-foreground">{t("attemptConfiguration.description")}</p>
    <form className="grid gap-2" onSubmit={event => { event.preventDefault(); if (canSave) void save(); }}>
      <label htmlFor="vtv-attempt-limit" className="text-sm font-medium">{t("attemptConfiguration.label")}</label>
      <Input id="vtv-attempt-limit" type="number" inputMode="numeric" min={1} max={12} step={1} required value={model.input} disabled={disabled} onChange={event => model.setInput(event.currentTarget.value)} aria-invalid={!model.valid} aria-describedby="vtv-attempt-help vtv-attempt-validation" className="min-h-11 w-full sm:max-w-48" />
      <p id="vtv-attempt-help" className="text-sm text-muted-foreground">{t("attemptConfiguration.fixed")}</p>
      <p id="vtv-attempt-validation" role="status" className="min-h-5 text-sm">{model.valid ? "" : t("attemptConfiguration.invalid")}</p>
      <label htmlFor="vtv-initial-absent" className="text-sm font-medium">{t("attemptConfiguration.clues")}</label>
      <Input id="vtv-initial-absent" type="number" inputMode="numeric" min={0} max={17} step={1} required value={clues.input} disabled={disabled} onChange={event => clues.setInput(event.currentTarget.value)} aria-invalid={!clues.valid} aria-describedby="vtv-clues-help vtv-clues-validation" className="min-h-11 w-full sm:max-w-48" />
      <p id="vtv-clues-help" className="text-sm text-muted-foreground">{t("attemptConfiguration.cluesHelp")}</p>
      <p id="vtv-clues-validation" role="status" className="min-h-5 text-sm">{clues.valid ? "" : t("attemptConfiguration.cluesInvalid")}</p>
      <Button type="submit" disabled={!canSave} className="min-h-11 justify-self-start">{t("attemptConfiguration.save")}</Button>
    </form>
  </section>;
}
