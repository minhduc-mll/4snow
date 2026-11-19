"use client";

import { Button } from "@/components/atoms/Button";
import { useAppI18n } from "@/hooks/useAppI18n";
import type { LetterFeedback } from "@/types/vua-tieng-viet";
import { WordVariantKey } from "@/components/molecules/WordVariantKey";
import { variantsFor } from "@/lib/vua-tieng-viet/letter-variants";
import styles from "@/components/organisms/vua-tieng-viet/word-game.module.css";

type Props = { knowledge: Map<string,LetterFeedback>; disabled: boolean; blockAbsentLetters: boolean; onKey: (letter: string, restoreFocus?: boolean) => void; focusInput: () => void };
export function WordKeyboard({ knowledge, disabled, blockAbsentLetters, onKey, focusInput }: Props) {
  const { t } = useAppI18n();
  return <section className={styles.keyboard} aria-label={t("wordGame.keyboard")}>
    {["QWERTYUIOP","ASDFGHJKL","ZXCVBNM"].map(row => <div key={row} className={styles.keyRow}>
      {Array.from(row).map(letter => {
        const feedback = knowledge.get(letter);
        return <div key={letter} className={styles.keyColumn}>
          <Button variant="outline" className={styles.key} data-feedback={feedback} disabled={disabled || (blockAbsentLetters && feedback === "absent")} aria-label={`${letter}${feedback ? `, ${t(`wordGame.${feedback}`)}` : ""}`} onClick={() => onKey(letter)} whileTap={{ scale: 1 }}>{letter}</Button>
        </div>;
      })}
    </div>)}
    <div className={styles.variantRow}>
      {Array.from("AEIOUYD").map(letter => <WordVariantKey key={letter} base={letter} variants={variantsFor(letter)} knowledge={knowledge} disabled={disabled} blockAbsentLetters={blockAbsentLetters} onSelect={variant => onKey(variant,false)} focusInput={focusInput} />)}
    </div>
    <Button variant="outline" disabled={disabled} className={styles.backspace} onClick={() => onKey("Backspace")} whileTap={{ scale: 1 }}>{t("wordGame.backspace")}</Button>
  </section>;
}
