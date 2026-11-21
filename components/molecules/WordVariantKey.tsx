"use client";

import { ChevronUp } from "lucide-react";
import { Button } from "@/components/atoms/Button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/atoms/Popover";
import { useAppI18n } from "@/hooks/useAppI18n";
import { useWordVariantPicker } from "@/hooks/useWordVariantPicker";
import type { LetterFeedback } from "@/types/vua-tieng-viet";
import styles from "@/components/organisms/vua-tieng-viet/word-game.module.css";

type Props = { base: string; variants: readonly string[]; knowledge: Map<string,LetterFeedback>; disabled: boolean; onKey: (letter: string, restoreFocus?: boolean) => void; focusInput: () => boolean };
export function WordVariantKey({ base, variants, knowledge, disabled, onKey, focusInput }: Props) {
  const { t } = useAppI18n();
  const picker = useWordVariantPicker(onKey,focusInput);
  const name = t("wordGame.variants",{ letter: base });
  const feedback = knowledge.get(base);
  return <Popover modal open={picker.open} onOpenChange={picker.changeOpen}>
    <PopoverTrigger asChild>
      <Button {...picker.triggerProps} variant="outline" className={styles.key} value={base} data-feedback={feedback} disabled={disabled} aria-label={`${base}${feedback ? `, ${t(`wordGame.${feedback}`)}` : ""}`} aria-describedby="vtv-accent-picker-hint" aria-keyshortcuts="ArrowUp Shift+Enter" whileTap={{ scale: 1 }}>
        {base}<ChevronUp className={styles.accentIndicator} aria-hidden="true" />
      </Button>
    </PopoverTrigger>
    <PopoverContent className={styles.variantDialog} side="top" collisionPadding={12} aria-label={name} onCloseAutoFocus={picker.closeAutoFocus}>
      <p className={styles.variantTitle}>{name}</p>
      <div className={styles.variantGrid}>{variants.map(letter => {
        const feedback = knowledge.get(letter);
        return <Button key={letter} variant="outline" className={styles.variantChoice} data-feedback={feedback} disabled={disabled} aria-label={`${t("wordGame.enterLetter",{ letter })}${feedback ? `, ${t(`wordGame.${feedback}`)}` : ""}`} onClick={() => picker.select(letter)} whileTap={{ scale: 1 }}>{letter}</Button>;
      })}</div>
      <Button variant="ghost" className={styles.variantClose} onClick={() => picker.changeOpen(false)} whileTap={{ scale: 1 }}>{t("wordGame.closeVariants")}</Button>
    </PopoverContent>
  </Popover>;
}
