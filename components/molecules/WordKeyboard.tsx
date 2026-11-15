"use client";

import { Button } from "@/components/atoms/Button";
import { useAppI18n } from "@/hooks/useAppI18n";
import type { LetterFeedback } from "@/types/vua-tieng-viet";
import { feedbackSymbols } from "@/components/molecules/WordBoard";
import { WordVariantKey } from "@/components/molecules/WordVariantKey";
import { variantsFor } from "@/lib/vua-tieng-viet/letter-variants";
import styles from "@/components/organisms/vua-tieng-viet/word-game.module.css";

type Props = { knowledge: Map<string,LetterFeedback>; disabled: boolean; onKey: (letter: string, restoreFocus?: boolean) => void; focusInput: () => void };
export function WordKeyboard({ knowledge, disabled, onKey, focusInput }: Props) {
  const { t } = useAppI18n();
  return <section className={styles.keyboard} aria-label={t("wordGame.keyboard")}>
    {["QWERTYUIOP","ASDFGHJKL","ZXCVBNM"].map(row => <div key={row} className={styles.keyRow}>
      {Array.from(row).map(letter => {
        const feedback = knowledge.get(letter);
        const variants = variantsFor(letter);
        return <div key={letter} className={styles.keyColumn}>
          <Button variant="outline" className={styles.key} data-feedback={feedback} disabled={disabled || feedback === "absent"} aria-label={`${letter}${feedback ? `, ${t(`wordGame.${feedback}`)}` : ""}`} onClick={() => onKey(letter)} whileTap={{ scale: 1 }}>{letter}{feedback ? <span aria-hidden="true" className={styles.keySymbol}>{feedbackSymbols[feedback]}</span> : null}</Button>
          {variants.length ? <WordVariantKey base={letter} variants={variants} knowledge={knowledge} disabled={disabled} onSelect={variant => onKey(variant,false)} focusInput={focusInput} /> : Array.from(row).some(key => variantsFor(key).length) ? <span className={styles.expansionSpacer} aria-hidden="true" /> : null}
        </div>;
      })}
    </div>)}
    <Button variant="outline" disabled={disabled} className={styles.backspace} onClick={() => onKey("Backspace")} whileTap={{ scale: 1 }}>{t("wordGame.backspace")}</Button>
    <p className={styles.keyboardHint}>{t("wordGame.imeHint")}</p>
  </section>;
}
