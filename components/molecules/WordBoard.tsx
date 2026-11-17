"use client";

import type { CSSProperties } from "react";
import { Input, type InputProps } from "@/components/atoms/Input";
import { useAppI18n } from "@/hooks/useAppI18n";
import type { LetterFeedback, WordLevel, WordRound } from "@/types/vua-tieng-viet";
import styles from "@/components/organisms/vua-tieng-viet/word-game.module.css";

export const feedbackSymbols: Record<LetterFeedback,string> = { correct: "✓", present: "↔", absent: "×" };
type Props = { round: WordRound | null; level: WordLevel; letters: string[]; field: InputProps };
type BoardStyle = CSSProperties & { "--vtv-columns": number; "--vtv-rows": number };
export function WordBoard({ round, level, letters, field }: Props) {
  const { t } = useAppI18n();
  const boardStyle: BoardStyle = { "--vtv-columns": level, "--vtv-rows": round?.attemptLimit ?? 6 };
  return <ol className={styles.board} style={boardStyle} aria-label={t("wordGame.board")}>
    {Array.from({ length: round?.attemptLimit ?? 6 },(_,rowIndex) => {
      const guess = round?.guesses[rowIndex];
      const editing = !!round && round.status === "playing" && rowIndex === round.guesses.length;
      const cells = guess ? Array.from(guess.normalized) : editing ? letters : [];
      return <li key={rowIndex} className={`${styles.row} ${editing ? styles.editing : ""}`} aria-label={t("wordGame.row",{ number: rowIndex + 1 })}>
        {Array.from({ length: level },(_,column) => {
          const feedback = guess?.feedback[column], letter = cells[column] ?? "";
          return <span key={column} className={styles.cell} data-feedback={feedback} role="img" aria-label={`${t("wordGame.cell",{ number: column + 1 })}: ${letter || t("wordGame.empty")}${feedback ? `, ${t(`wordGame.${feedback}`)}` : ""}`}>
            <span aria-hidden="true">{letter}</span>{feedback ? <span className={styles.symbol} aria-hidden="true">{feedbackSymbols[feedback]}</span> : null}
          </span>;
        })}
        {editing ? <Input {...field} id="vtv-word-input" className={styles.sharedInput} aria-label={t("wordGame.input")} aria-describedby="vtv-instructions vtv-message" autoComplete="off" autoCapitalize="characters" spellCheck={false} whileFocus={{ scale: 1 }} /> : null}
      </li>;
    })}
  </ol>;
}
