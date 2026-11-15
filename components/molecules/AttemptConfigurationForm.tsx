"use client";

import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { useAppI18n } from "@/hooks/useAppI18n";
import { useAttemptLimitInput } from "@/hooks/useAttemptLimitInput";
import type { DraftConfiguration } from "@/lib/vua-tieng-viet/publication-response";

type Props = { configuration: DraftConfiguration; disabled: boolean; onSave: (attempts: number) => void };
export function AttemptConfigurationForm({ configuration, disabled, onSave }: Props) {
  const { t } = useAppI18n();
  const model = useAttemptLimitInput(configuration.configuration.attemptLimit);
  return <section aria-label={t("attemptConfiguration.title")} className="grid gap-3 rounded-lg border p-4">
    <h3 className="font-semibold">{t("attemptConfiguration.title")}</h3>
    <p className="text-sm text-muted-foreground">{t("attemptConfiguration.description")}</p>
    <form className="grid gap-2" onSubmit={event => { event.preventDefault(); if (model.valid && model.changed && !disabled) onSave(model.value); }}>
      <label htmlFor="vtv-attempt-limit" className="text-sm font-medium">{t("attemptConfiguration.label")}</label>
      <Input id="vtv-attempt-limit" type="number" inputMode="numeric" min={1} max={12} step={1} required value={model.input} disabled={disabled} onChange={event => model.setInput(event.currentTarget.value)} aria-invalid={!model.valid} aria-describedby="vtv-attempt-help vtv-attempt-validation" className="min-h-11 w-full sm:max-w-48" />
      <p id="vtv-attempt-help" className="text-sm text-muted-foreground">{t("attemptConfiguration.fixed")}</p>
      <p id="vtv-attempt-validation" role="status" className="min-h-5 text-sm">{model.valid ? "" : t("attemptConfiguration.invalid")}</p>
      <Button type="submit" disabled={disabled || !model.valid || !model.changed} className="min-h-11 justify-self-start">{t("attemptConfiguration.save")}</Button>
    </form>
    <p className="text-sm">{t("attemptConfiguration.draft",{ attempts: configuration.configuration.attemptLimit, revision: configuration.draftRevision })}</p>
  </section>;
}
