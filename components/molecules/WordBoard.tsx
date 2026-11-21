"use client";

import { LockKeyhole } from "lucide-react";
import type { CSSProperties } from "react";
import { Input, type InputProps } from "@/components/atoms/Input";
import { useAppI18n } from "@/hooks/useAppI18n";
import type { WordLevel, WordRound } from "@/types/vua-tieng-viet";
import { lockedPositions } from "@/lib/vua-tieng-viet/round-hints";
import styles from "@/components/organisms/vua-tieng-viet/word-game.module.css";

type Props = { round: WordRound | null; level: WordLevel; letters: string[]; field: InputProps; rejectedPosition?: number };
type BoardStyle = CSSProperties & { "--vtv-columns": number; "--vtv-rows": number };
export function WordBoard({ round, level, letters, field, rejectedPosition }: Props) {
  const { t } = useAppI18n();
  const boardStyle: BoardStyle = { "--vtv-columns": level, "--vtv-rows": round?.attemptLimit ?? 6 };
  return <ol className={styles.board} style={boardStyle} aria-label={t("wordGame.board")}>
    {Array.from({ length: round?.attemptLimit ?? 6 },(_,rowIndex) => {
      const guess = round?.guesses[rowIndex];
      const editing = !!round && round.status === "playing" && rowIndex === round.guesses.length;
      const locked = round ? lockedPositions(round, rowIndex) : [];
      const cells = guess ? Array.from(guess.normalized) : editing ? letters : [];
      return <li key={rowIndex} className={`${styles.row} ${editing ? styles.editing : ""}`} data-rejected={editing && rejectedPosition !== undefined && rejectedPosition > level ? true : undefined} aria-label={t("wordGame.row",{ number: rowIndex + 1 })}>
        {Array.from({ length: level },(_,column) => {
          const lockedCell = locked.includes(column);
          const feedback = lockedCell ? "correct" : guess?.feedback[column], letter = cells[column] ?? "";
          return <span key={column} className={styles.cell} data-feedback={feedback} data-locked={lockedCell || undefined} data-rejected={editing && rejectedPosition === column + 1 ? true : undefined} role="img" aria-label={`${t("wordGame.cell",{ number: column + 1 })}: ${letter || t("wordGame.empty")}${feedback ? `, ${t(`wordGame.${feedback}`)}` : ""}${lockedCell ? `, ${t("wordGame.hints.locked")}` : ""}`}>
            <span aria-hidden="true">{letter}</span>
            {lockedCell ? <LockKeyhole className={styles.lockedIndicator} aria-hidden="true" /> : null}
          </span>;
        })}
        {editing ? <Input {...field} id="vtv-word-input" className={styles.sharedInput} aria-label={t("wordGame.input")} aria-invalid={rejectedPosition !== undefined || undefined} aria-describedby="vtv-instructions vtv-message" autoComplete="off" autoCapitalize="characters" spellCheck={false} whileFocus={{ scale: 1 }} /> : null}
      </li>;
    })}
  </ol>;
}
