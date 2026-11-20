"use client";

import type { RefObject } from "react";
import { Button } from "@/components/atoms/Button";
import { useAppI18n } from "@/hooks/useAppI18n";
import type { LetterFeedback } from "@/types/vua-tieng-viet";
import { WordVariantKey } from "@/components/molecules/WordVariantKey";
import { KEYBOARD_ROWS } from "@/lib/vua-tieng-viet/player-engine";
import { variantsFor } from "@/lib/vua-tieng-viet/letter-variants";
import styles from "@/components/organisms/vua-tieng-viet/word-game.module.css";

type Props = { knowledge: Map<string,LetterFeedback>; disabled: boolean; onKey: (letter: string, restoreFocus?: boolean) => void; focusInput: () => boolean; openNativeKeyboard: () => void; nativeKeyboardButtonRef: RefObject<HTMLButtonElement | null> };
export function WordKeyboard({ knowledge, disabled, onKey, focusInput, openNativeKeyboard, nativeKeyboardButtonRef }: Props) {
  const { t } = useAppI18n();
  return <section className={styles.keyboard} aria-label={t("wordGame.keyboard")}>
    {KEYBOARD_ROWS.map(row => <div key={row} className={styles.keyRow}>
      {Array.from(row).map(letter => {
        const feedback = knowledge.get(letter);
        return <div key={letter} className={styles.keyColumn}>
          <Button variant="outline" className={styles.key} data-feedback={feedback} disabled={disabled} aria-label={`${letter}${feedback ? `, ${t(`wordGame.${feedback}`)}` : ""}`} onClick={() => onKey(letter)} whileTap={{ scale: 1 }}>{letter}</Button>
        </div>;
      })}
    </div>)}
    <div className={styles.variantRow}>
      {Array.from("AEIOUYD").map(letter => <WordVariantKey key={letter} base={letter} variants={variantsFor(letter)} knowledge={knowledge} disabled={disabled} onSelect={variant => onKey(variant,false)} focusInput={focusInput} />)}
    </div>
    <div className={styles.keyboardActions}>
      <Button variant="outline" disabled={disabled} className={styles.backspace} onClick={() => onKey("Backspace")} whileTap={{ scale: 1 }}>{t("wordGame.backspace")}</Button>
      <Button ref={nativeKeyboardButtonRef} variant="outline" disabled={disabled} className={styles.nativeKeyboard} aria-controls="vtv-word-input" onClick={openNativeKeyboard}>{t("wordGame.openNativeKeyboard")}</Button>
    </div>
  </section>;
}
