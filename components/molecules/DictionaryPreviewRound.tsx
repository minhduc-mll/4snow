"use client";

import { useId, useRef } from "react";
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { useAppI18n } from "@/hooks/useAppI18n";
import { usePublicationPreviewRound } from "@/hooks/usePublicationPreviewRound";
import type { PlayerErrorCode } from "@/lib/vua-tieng-viet/player-engine";
import type { PublicationPreview } from "@/lib/vua-tieng-viet/publication-response";
import type { WordLevel } from "@/types/vua-tieng-viet";

type Props = { preview: PublicationPreview; onUnauthorized: () => void };
const LEVELS: WordLevel[] = [3, 5, 7, 9];
const errorLabels: Partial<Record<PlayerErrorCode, string>> = {
  INCOMPLETE: "publication.previewIncomplete",
  INVALID_INPUT: "publication.previewInvalid",
  NOT_IN_DICTIONARY: "publication.previewUnknown",
};

export function DictionaryPreviewRound({ preview, onUnauthorized }: Props) {
  const { t } = useAppI18n();
  const { build, round, start, submit, error } = usePublicationPreviewRound(preview.buildId, preview.contentHash, onUnauthorized);
  const inputRef = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const inputId = useId();
  const state = round?.round;
  const errorLabel = (error ? errorLabels[error] : undefined) ?? "publication.previewUnavailable";

  if (build.isPending) return <p role="status">{t("publication.busy")}</p>;
  if (build.isError) return <div className="grid gap-2">
    <p role="alert">{t("publication.previewUnavailable")}</p>
    <Button variant="outline" onClick={() => void build.refetch()}>{t("editorial.retry")}</Button>
  </div>;

  return <div className="grid gap-4">
    <div className="flex flex-wrap gap-2">
      {LEVELS.map(level => <Button key={level} type="button" variant={state?.level === level ? "primary" : "outline"} onClick={() => { composing.current = false; start(level); }}>
        {t("publication.testLevel", { level })}
      </Button>)}
    </div>
    {round && state ? <>
      <p role="status">{t("publication.previewAttempts", { used: state.guesses.length, limit: state.attemptLimit })}</p>
      <ol className="grid gap-2">
        {state.guesses.map(guess => <li key={guess.id} className="flex flex-wrap gap-2 rounded-md border p-2">
          {Array.from(guess.normalized).map((letter, index) => <span className="rounded-sm bg-muted px-2 py-1 text-sm" key={index}>
            <strong>{letter}</strong> · {t(`wordGame.${guess.feedback[index]}`)}
          </span>)}
        </li>)}
      </ol>
      {state.status === "playing" ? <form className="grid gap-2" onSubmit={event => {
        event.preventDefault();
        const input = inputRef.current;
        if (!input || composing.current) return;
        if (submit(input.value)) input.value = "";
        input.focus();
      }}>
        <label htmlFor={inputId}>{t("wordGame.input")}</label>
        <div className="flex gap-2">
          <Input key={state.id} id={inputId} ref={inputRef} maxLength={120} autoComplete="off" autoCapitalize="characters" spellCheck={false}
            onCompositionStart={() => { composing.current = true; }}
            onCompositionEnd={() => { composing.current = false; }}
            onKeyDown={event => { if (event.key === "Enter" && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault(); }}
          />
          <Button type="submit">{t("publication.previewSubmit")}</Button>
        </div>
      </form> : <div role="status" className="grid gap-1">
        <p className="font-semibold">{t(state.status === "won" ? "publication.previewWon" : "publication.previewLost")}</p>
        <p>{round.answer.original} · {round.answer.definitionVi}</p>
      </div>}
    </> : null}
    {error ? <p role="alert">{t(errorLabel)}</p> : null}
  </div>;
}
