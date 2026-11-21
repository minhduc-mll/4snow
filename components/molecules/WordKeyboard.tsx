"use client";

import type { RefObject } from "react";
import { Delete } from "lucide-react";
import { Button } from "@/components/atoms/Button";
import { useAppI18n } from "@/hooks/useAppI18n";
import type { LetterFeedback } from "@/types/vua-tieng-viet";
import { WordVariantKey } from "@/components/molecules/WordVariantKey";
import { KEYBOARD_ROWS } from "@/lib/vua-tieng-viet/player-engine";
import { variantsFor } from "@/lib/vua-tieng-viet/letter-variants";
import styles from "@/components/organisms/vua-tieng-viet/word-game.module.css";

type Props = { knowledge: Map<string,LetterFeedback>; disabled: boolean; onKey: (letter: string, restoreFocus?: boolean) => void; focusInput: () => boolean; firstKeyRef: RefObject<HTMLButtonElement | null> };
export function WordKeyboard({ knowledge, disabled, onKey, focusInput, firstKeyRef }: Props) {
  const { t } = useAppI18n();
  return <section className={styles.keyboard} aria-label={t("wordGame.keyboard")}>
    {KEYBOARD_ROWS.map((row,rowIndex) => <div key={row} className={styles.keyRow}>
      {Array.from(row).map((letter,letterIndex) => {
        const feedback = knowledge.get(letter);
        const variants = variantsFor(letter);
        return <div key={letter} className={styles.keyColumn}>
          {variants.length > 1
            ? <WordVariantKey base={letter} variants={variants} knowledge={knowledge} disabled={disabled} onKey={onKey} focusInput={focusInput} />
            : <Button ref={rowIndex === 0 && letterIndex === 0 ? firstKeyRef : undefined} variant="outline" className={styles.key} data-feedback={feedback} disabled={disabled} aria-label={`${letter}${feedback ? `, ${t(`wordGame.${feedback}`)}` : ""}`} onClick={() => onKey(letter)} whileTap={{ scale: 1 }}>{letter}</Button>}
        </div>;
      })}
      {rowIndex === KEYBOARD_ROWS.length - 1 ? <div className={styles.backspaceColumn}>
        <Button variant="outline" disabled={disabled} className={styles.key} aria-label={t("wordGame.backspace")} onClick={() => onKey("Backspace")} whileTap={{ scale: 1 }}><Delete aria-hidden="true" /></Button>
      </div> : null}
    </div>)}
    <p id="vtv-accent-picker-hint" className={styles.keyboardHint}>{t("wordGame.chooseAccent")}</p>
  </section>;
}
