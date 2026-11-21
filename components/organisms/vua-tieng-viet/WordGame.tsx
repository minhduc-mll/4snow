"use client";

import Link from "next/link";
import { useEffect, useRef, type MouseEvent } from "react";
import { ArrowLeft, BookOpen } from "lucide-react";
import { MotionConfig } from "framer-motion";
import { Button } from "@/components/atoms/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/atoms/Dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/atoms/Popover";
import { WordBoard } from "@/components/molecules/WordBoard";
import { WordKeyboard } from "@/components/molecules/WordKeyboard";
import { WordAttributions } from "@/components/molecules/WordAttributions";
import { LanguageControl } from "@/components/molecules/LanguageControl";
import { useWordRound } from "@/hooks/useWordRound";
import { useWordOfflineShell } from "@/hooks/useWordOfflineShell";
import { useAppI18n } from "@/hooks/useAppI18n";
import { PATH } from "@/lib/paths";
import { VOCABULARY_RETURN_FOCUS } from "@/lib/vua-tieng-viet/public-vocabulary";
import type { AccentAccuracy, GuessMode, LetterFeedback, RoundSettings, WordDifficulty, WordLevel } from "@/types/vua-tieng-viet";
import styles from "./word-game.module.css";

const levels: WordLevel[] = [3,5,7,9];
const modes: GuessMode[] = ["dictionary","free"];
const difficulties: WordDifficulty[] = ["easy", "hard", "expert"];
const accuracies: AccentAccuracy[] = ["strict", "optional"];
const feedbackStates: LetterFeedback[] = ["correct","present","absent"];
const interactive = "a, button, input, label, select, textarea, summary, [tabindex], [contenteditable], [role=button], [role=dialog]";

export function WordGame() {
  const { t } = useAppI18n();
  const offlineShell = useWordOfflineShell();
  const model = useWordRound();
  const { state, settings, settingsDraft, input } = model;
  const round = state?.round;
  const playing = round?.status === "playing";
  const { actionRef, eligibility } = input;
  const vocabularyLink = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    try {
      if (sessionStorage.getItem(VOCABULARY_RETURN_FOCUS)) {
        sessionStorage.removeItem(VOCABULARY_RETURN_FOCUS);
        vocabularyLink.current?.focus({ preventScroll: true });
      }
    } catch { /* The link remains usable when storage is unavailable. */ }
  }, []);
  const rememberVocabularyLink = () => {
    try { sessionStorage.setItem(VOCABULARY_RETURN_FOCUS, "1"); }
    catch { /* Navigation remains available. */ }
  };
  const describeSettings = ({ level, guessMode, accuracy, difficulty }: RoundSettings, legacy = false) => t("wordGame.settings.summary", {
    level,
    mode: t(`wordGame.settings.${guessMode}`),
    difficulty: t(`wordGame.settings.${difficulty}`),
    accuracy: t(`wordGame.settings.${legacy ? "legacy" : accuracy}`),
  });
  const focusOnPlayArea = (event: MouseEvent<HTMLElement>) => {
    if (!playing || model.busy || settingsDraft || model.helpOpen || event.button !== 0 ||
      event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.defaultPrevented) return;
    const { target, currentTarget } = event;
    if (!(target instanceof Element) || !currentTarget.contains(target) || target.closest(interactive)) return;
    if (window.getSelection()?.type !== "Range") input.focusInput();
  };
  const eligibilityMessage = !eligibility.canSubmit && eligibility.reason === "not-in-dictionary"
    ? t("wordGame.errors.NOT_IN_DICTIONARY")
    : !eligibility.canSubmit && eligibility.reason === "incomplete"
      ? t("wordGame.requiredLength",{ level: settings.level }) : t("wordGame.typeHint");
  const message = model.busy ? t("wordGame.loading")
    : model.error === "INVALID_INPUT" && input.rejected ? t(
      input.rejected.kind === "length" ? "wordGame.rejectedLength" : "wordGame.rejectedInput",
      { letter: input.rejected.letter, position: input.rejected.position, level: settings.level },
    )
    : model.error ? t(`wordGame.errors.${model.error}`)
    : model.damagedSave ? t(`wordGame.recovery.${model.recovery}`)
    : input.draft !== null ? t("wordGame.composing")
    : playing && model.restoredRoundId ? t("wordGame.recovery.resumed")
    : state?.singleAnswerReplay && round?.guesses.length === 0 && round.input === "" ? t("wordGame.singleAnswer")
    : !round ? t("wordGame.startHint") : playing ? eligibilityMessage : "";

  return <MotionConfig reducedMotion="user"><main className={`${styles.shell} ${round ? styles.activeShell : ""}`} onClick={focusOnPlayArea}>
    <div className={styles.container}>
      <nav className={styles.topbar} aria-label={t("wordGame.navigation")}>
        <Link href={PATH.home} className={styles.home}><ArrowLeft size={16} aria-hidden="true" />{t("adminAuth.homeAction")}</Link>
        <div className={styles.topActions}>
          <Link ref={vocabularyLink} href={PATH.vietnameseVocabulary} onNavigate={rememberVocabularyLink} className={styles.lookup}>
            <BookOpen size={16} aria-hidden="true" />{t("vocabularyCatalog.lookup")}
          </Link>
          <Button variant="ghost" onClick={model.openHelp} className={styles.help}>{t("wordGame.help")}</Button>
          <Button variant="ghost" onClick={model.openSettings} className={styles.help} disabled={model.busy}>{t("wordGame.settings.title")}</Button>
        </div>
      </nav>
      {round ? <h1 className={styles.srOnly}>Vua Tiếng Việt</h1> : <header className={styles.header}>
        <h1>Vua Tiếng Việt</h1>
        <p>{t("wordGame.tagline")}</p>
      </header>}
      <section className={styles.playArea} aria-label={t("wordGame.playArea")}>
        <div className={`${styles.boardMeta} ${styles.streakMeta}`} aria-live="polite" aria-atomic="true">
          <span>{t("wordGame.streak.current",{ count: model.streak.current })}</span>
          <span>{t("wordGame.streak.longest",{ count: model.streak.longest })}</span>
        </div>
        <div className={styles.boardMeta}>
          <span>{describeSettings(settings, Boolean(round && !round.rules.accuracy))}</span>
          {round ? <span aria-live="polite" aria-atomic="true">{t("wordGame.attempts",{ used: round.guesses.length, limit: round.attemptLimit })}</span> : null}
        </div>
        {round ? <WordBoard round={round} level={round.level} letters={input.letters} field={input.field} showTextFeedback={model.showTextFeedback}
          rejectedPosition={model.error === "INVALID_INPUT" ? input.rejected?.position : undefined} /> : null}
        <div id="vtv-message" role="status" aria-atomic="true" className={styles.message}>{message}</div>
        {model.storageWarning ? <p role="alert" className={styles.instruction}>{t("wordGame.recovery.warning")}</p> : null}
        {model.retry ? <Button variant="outline" onClick={model.retry} disabled={model.busy}>{t("wordGame.settings.retry")}</Button> : null}
        {state && round && !playing ? <section className={styles.result} aria-label={t("wordGame.result")}>
          <h2 id="vtv-result-title">{t(round.status === "won" ? "wordGame.won" : "wordGame.lost")}</h2>
          <p id="vtv-result-answer" className={styles.answer}>{state.answer.original}</p><p>{state.answer.definitionVi}</p>
          <p>{t("wordGame.attempts",{ used: round.guesses.length, limit: round.attemptLimit })}</p>
          <Button ref={actionRef} aria-describedby="vtv-result-title vtv-result-answer" disabled={model.busy} onClick={model.start} className={styles.primary}>{t("wordGame.replay")}</Button>
          <WordAttributions items={state.attributions} />
        </section> : null}
        {!round ? <Button ref={actionRef} disabled={model.busy} aria-describedby={model.damagedSave ? "vtv-recovery-impact" : undefined} onClick={model.start} className={styles.submit} size="lg">{t(model.damagedSave ? "wordGame.recovery.startNew" : "wordGame.start")}</Button> : null}
        {model.damagedSave ? <p id="vtv-recovery-impact" className={styles.instruction}>{t("wordGame.recovery.impact")}</p> : null}
      </section>
      <p id="vtv-instructions" className={styles.srOnly}>{t("wordGame.instruction")}</p>
      {playing ? <><WordKeyboard {...input.keyboard} /><div className={styles.roundActions}>
        <Button disabled={!eligibility.canSubmit} onClick={input.submit} className={styles.submit} size="lg">{t("wordGame.submit")}</Button>
        <Button variant="outline" onClick={model.openSettings} className={styles.restart} disabled={model.busy}>{t("wordGame.recovery.startNew")}</Button>
      </div></> : null}
      {!round ? <LanguageControl inline /> : null}
      <p aria-live="polite" className={round ? styles.srOnly : styles.instruction}>{t(`wordGame.recovery.${offlineShell}`)}</p>
    </div>
    <Dialog open={model.conflict}><DialogContent showCloseButton={false} className={styles.dialog} onEscapeKeyDown={event => event.preventDefault()} onInteractOutside={event => event.preventDefault()} onCloseAutoFocus={event => { event.preventDefault(); input.restoreConflictFocus(); }}>
      <DialogHeader><DialogTitle>{t("wordGame.conflict.title")}</DialogTitle><DialogDescription>{t("wordGame.conflict.description")}</DialogDescription></DialogHeader>
      {model.resolutionError ? <p role="alert">{t(`wordGame.conflict.errors.${model.resolutionError}`)}</p> : null}
      <DialogFooter><Button disabled={model.resolutionBusy} onClick={() => void model.resolveConflict("load")} className={styles.primary}>{t("wordGame.conflict.load")}</Button><Button disabled={model.resolutionBusy || !state} variant="outline" onClick={() => void model.resolveConflict("keep")}>{t("wordGame.conflict.keep")}</Button></DialogFooter>
    </DialogContent></Dialog>
    <Dialog open={model.helpOpen} onOpenChange={model.setHelpOpen}><DialogContent className={styles.dialog} onCloseAutoFocus={event => { event.preventDefault(); input.restoreFocus(); }}>
      <DialogHeader><DialogTitle>{t("wordGame.help")}</DialogTitle><DialogDescription>{t(round ? "wordGame.helpAttempts" : "wordGame.helpIntro",{ limit: round?.attemptLimit })}</DialogDescription></DialogHeader>
      <p>{t("wordGame.helpAccents")}</p>{!round || round.rules.accuracy ? <p>{t("wordGame.settings.accuracyHelp")}</p> : null}
      <ul className={styles.legend} aria-label={t("wordGame.legend")}>{feedbackStates.map(feedback => <li key={feedback}><span className={styles.legendSymbol} data-feedback={feedback} aria-hidden="true" />{t(`wordGame.${feedback}`)}</li>)}</ul>
      <p>{t("wordGame.helpExample")}</p>
      <p>{t("wordGame.helpInput")}</p>
      <p>{t("wordGame.helpDictionary")}</p>
      <details><summary className="cursor-pointer font-medium">{t("wordGame.helpRepeated")}</summary><p>{t("wordGame.helpRepeatedExample")}</p></details>
      {state && playing ? <WordAttributions items={state.attributions} sourceOnly /> : null}
      <DialogFooter><Button className={styles.primary} onClick={() => model.setHelpOpen(false)}>{t("wordGame.close")}</Button></DialogFooter>
    </DialogContent></Dialog>
    <Dialog open={settingsDraft !== null} onOpenChange={open => { if (!open) model.setSettingsDraft(null); }}><DialogContent className={styles.dialog} onCloseAutoFocus={event => { event.preventDefault(); input.restoreFocus(); }}>
      <DialogHeader><DialogTitle>{t("wordGame.settings.title")}</DialogTitle>
        <DialogDescription>{playing ? t("wordGame.confirmDescription") : t("wordGame.settings.description")}</DialogDescription>
      </DialogHeader>
      {settingsDraft ? <div className={styles.settingsGroups}>
        <fieldset className={styles.levels}><legend>{t("wordGame.level")}</legend><div className={styles.levelButtons}>
          {levels.map(level => <Button key={level} variant="outline" aria-pressed={settingsDraft.level === level} className={styles.levelButton} onClick={() => model.setSettingsDraft({ ...settingsDraft, level })}>{level} {t("wordGame.letters")}</Button>)}
        </div></fieldset>
        <fieldset className={styles.levels}>
          <legend>{t("wordGame.settings.difficulty")} <SettingsHelp label={t("wordGame.settings.difficultyHelpLabel")} text={t("wordGame.settings.difficultyHelp")} /></legend>
          <div className={`${styles.levelButtons} ${styles.difficultyButtons}`}>
            {difficulties.map(difficulty => <Button key={difficulty} variant="outline" aria-pressed={settingsDraft.difficulty === difficulty} className={styles.levelButton} onClick={() => model.setSettingsDraft({ ...settingsDraft, difficulty })}>{t(`wordGame.settings.${difficulty}`)}</Button>)}
          </div>
        </fieldset>
        <fieldset className={styles.levels}><legend>{t("wordGame.settings.mode")} <SettingsHelp label={t("wordGame.settings.modeHelpLabel")} text={t("wordGame.helpDictionary")} /></legend><div className={`${styles.levelButtons} ${styles.modeButtons}`}>
          {modes.map(guessMode => <Button key={guessMode} variant="outline" aria-pressed={settingsDraft.guessMode === guessMode} className={styles.levelButton} onClick={() => model.setSettingsDraft({ ...settingsDraft, guessMode })}>{t(`wordGame.settings.${guessMode}`)}</Button>)}
        </div></fieldset>
        <fieldset className={styles.levels}>
          <legend>{t("wordGame.settings.accuracy")} <SettingsHelp label={t("wordGame.settings.accuracyHelpLabel")} text={t("wordGame.settings.accuracyHelp")} /></legend>
          <div className={`${styles.levelButtons} ${styles.modeButtons}`}>
            {accuracies.map(accuracy => <Button key={accuracy} variant="outline" aria-pressed={settingsDraft.accuracy === accuracy} aria-describedby={accuracy === "strict" ? "vtv-strict-help" : undefined} className={styles.levelButton} onClick={() => model.setSettingsDraft({ ...settingsDraft, accuracy })}>{t(`wordGame.settings.${accuracy}`)}</Button>)}
          </div>
          <p id="vtv-strict-help" className={styles.accuracyDetail}>{t("wordGame.settings.strictHelp")}</p>
        </fieldset>
        <Button variant="outline" className={styles.levelButton} aria-pressed={model.showTextFeedback} onClick={() => model.setShowTextFeedback(value => !value)}>{t("wordGame.settings.textFeedback")}</Button>
        <LanguageControl inline />
        <p className={styles.settingsSummary}>{describeSettings(settingsDraft)}</p>
        <DialogFooter className={styles.settingsActions}>
          <Button variant="outline" onClick={() => model.setSettingsDraft(null)}>{t("wordGame.settings.cancel")}</Button>
          <Button className={styles.primary} onClick={model.applySettings}>{round ? t("wordGame.settings.applyRound") : t("wordGame.settings.apply")}</Button>
        </DialogFooter>
      </div> : null}
    </DialogContent></Dialog>
  </main></MotionConfig>;
}

function SettingsHelp({ label, text }: { label: string; text: string }) {
  return <Popover>
    <PopoverTrigger asChild>
      <Button variant="ghost" className={styles.settingsHelp} aria-label={label}>?</Button>
    </PopoverTrigger>
    <PopoverContent className={styles.settingsTip} sideOffset={4}>{text}</PopoverContent>
  </Popover>;
}
