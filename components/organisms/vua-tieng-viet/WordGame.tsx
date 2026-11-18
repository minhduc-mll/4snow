"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, CircleHelp } from "lucide-react";
import { MotionConfig } from "framer-motion";
import { Button } from "@/components/atoms/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/atoms/Dialog";
import { WordBoard, feedbackSymbols } from "@/components/molecules/WordBoard";
import { WordKeyboard } from "@/components/molecules/WordKeyboard";
import { WordAttributions } from "@/components/molecules/WordAttributions";
import { LanguageControl } from "@/components/molecules/LanguageControl";
import { useWordRound } from "@/hooks/useWordRound";
import { useWordOfflineShell } from "@/hooks/useWordOfflineShell";
import { useAppI18n } from "@/hooks/useAppI18n";
import { PATH } from "@/lib/paths";
import type { LetterFeedback, WordLevel } from "@/types/vua-tieng-viet";
import styles from "./word-game.module.css";

const levels: WordLevel[] = [3,5,7,9];
const feedbackStates: LetterFeedback[] = ["correct","present","absent"];
export function WordGame() {
  const { t } = useAppI18n();
  const offlineShell = useWordOfflineShell();
  const model = useWordRound(), state = model.state, round = state?.round;
  const [setupRoundId, setSetupRoundId] = useState<string | null>(null);
  const setup = !round || setupRoundId === round.id;
  const { actionRef } = model.input;
  return <MotionConfig reducedMotion="user"><main className={`${styles.shell} ${!setup ? styles.activeShell : ""}`}>
    <div className={styles.container}>
      <nav className={styles.topbar} aria-label={t("wordGame.navigation")}>
        <Link href={PATH.home} className={styles.home}><ArrowLeft size={16} aria-hidden="true" />{t("adminAuth.homeAction")}</Link>
        <Button variant="ghost" onClick={model.openHelp} className={styles.help} leftIcon={<CircleHelp size={18} aria-hidden="true" />}>{t("wordGame.help")}</Button>
      </nav>
      {setup ? <><header className={styles.header}><p className={styles.eyebrow}>{t("wordGame.solo")}</p><h1>Vua tiếng Việt</h1><p>{t("wordGame.tagline")}</p></header>
      <fieldset className={styles.levels} disabled={model.busy}><legend>{t("wordGame.level")}</legend><div className={styles.levelButtons}>{levels.map(level => <Button key={level} variant="outline" aria-pressed={model.level === level} onClick={event => model.chooseLevel(level,event)} className={styles.levelButton}>{level} {t("wordGame.letters")}</Button>)}</div></fieldset></> : null}
      <section className={styles.playArea} aria-label={t("wordGame.playArea")}>
        {round && !setup ? <><div className={styles.boardMeta}><span>{model.level} {t("wordGame.letters")}</span><span>{t("wordGame.attempts",{ used: round.guesses.length, limit: round.attemptLimit })}</span></div>
        <WordBoard round={round} level={model.level} letters={model.input.letters} field={model.input.field} /></> : null}
        <div id="vtv-message" role="status" aria-live="polite" aria-atomic="true" className={styles.message}>
          {model.busy ? t("wordGame.loading") : model.recovery === "invalid" || model.recovery === "incompatible" ? t(`wordGame.recovery.${model.recovery}`) : model.error ? t(`wordGame.errors.${model.error}`) : model.input.draft !== null ? t("wordGame.composing") : state?.singleAnswerReplay ? t("wordGame.singleAnswer") : !round ? t("wordGame.startHint") : round.status === "playing" ? t("wordGame.typeHint") : ""}
        </div>
        {model.storageWarning ? <p role="alert" className={styles.instruction}>{t("wordGame.recovery.warning")}</p> : null}
        {model.recovery === "invalid" || model.recovery === "incompatible" ? <Button variant="outline" onClick={model.resetSave}>{t("wordGame.recovery.reset")}</Button> : null}
        {state && round && !setup && round.status !== "playing" ? <section className={styles.result} aria-label={t("wordGame.result")}>
          <h2>{round.status === "won" ? "Chúc mừng! Bạn đã tìm ra đáp án." : t("wordGame.lost")}</h2>
          <p className={styles.answer}>{state.answer.original}</p><p>{state.answer.definitionVi}</p>
          <p>{t("wordGame.attempts",{ used: round.guesses.length, limit: round.attemptLimit })}</p>
          <Button ref={actionRef} disabled={model.busy} onClick={event => model.requestStart(model.level,event)} className={styles.primary}>{t("wordGame.replay")}</Button>
          <Button variant="outline" onClick={() => setSetupRoundId(round.id)}>{t("wordGame.level")}</Button>
          <WordAttributions items={state.attributions} />
        </section> : null}
        {setup ? <Button ref={actionRef} disabled={model.busy || model.recoveryBlocked} onClick={event => model.requestStart(model.level,event)} className={styles.submit} size="lg">{t("wordGame.start")}</Button> : null}
      </section>
      <p id="vtv-instructions" className={styles.srOnly}>{t("wordGame.instruction")}</p>
      {!setup && round?.status === "playing" ? <><WordKeyboard {...model.input.keyboard} /><Button ref={actionRef} disabled={!model.input.canSubmit} onClick={model.input.submit} className={styles.submit} size="lg">{t("wordGame.submit")}</Button></> : null}
      {setup ? <><LanguageControl inline /><p aria-live="polite" className={styles.instruction}>{t(`wordGame.recovery.${offlineShell}`)}</p></> : <p aria-live="polite" className={styles.srOnly}>{t(`wordGame.recovery.${offlineShell}`)}</p>}
    </div>
    <Dialog open={model.conflict}><DialogContent showCloseButton={false} className={styles.dialog} onEscapeKeyDown={event => event.preventDefault()} onInteractOutside={event => event.preventDefault()} onCloseAutoFocus={event => { event.preventDefault(); model.input.restoreConflictFocus(); }}><DialogHeader><DialogTitle>{t("wordGame.conflict.title")}</DialogTitle><DialogDescription>{t("wordGame.conflict.description")}</DialogDescription></DialogHeader>{model.resolutionError ? <p role="alert">{t(`wordGame.conflict.errors.${model.resolutionError}`)}</p> : null}<DialogFooter><Button disabled={model.resolutionBusy} onClick={() => void model.resolveConflict("load")} className={styles.primary}>{t("wordGame.conflict.load")}</Button><Button disabled={model.resolutionBusy || !state} variant="outline" onClick={() => void model.resolveConflict("keep")}>{t("wordGame.conflict.keep")}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={model.helpOpen} onOpenChange={model.setHelpOpen}><DialogContent className={styles.dialog} onCloseAutoFocus={event => { event.preventDefault(); model.input.restoreFocus(); }}><DialogHeader><DialogTitle>{t("wordGame.help")}</DialogTitle><DialogDescription>{t("wordGame.helpIntro")}</DialogDescription></DialogHeader><ul className={styles.legend} aria-label={t("wordGame.legend")}>{feedbackStates.map(feedback => <li key={feedback}><span className={styles.legendSymbol} data-feedback={feedback} aria-hidden="true">{feedbackSymbols[feedback]}</span>{t(`wordGame.${feedback}`)}</li>)}</ul><p>{t("wordGame.helpAccents")}</p><p>{t("wordGame.helpRepeated")}</p><p>{t("wordGame.helpRepeatedExample")}</p><p>{t("wordGame.helpInput")}</p><p>{t("wordGame.helpDictionary")}</p><LanguageControl inline />{round?.status === "playing" ? <Button variant="outline" onClick={event => { model.setHelpOpen(false); model.requestStart(model.level,event); }}>{t("wordGame.restart")}</Button> : null}{state ? <WordAttributions items={state.attributions} /> : null}<DialogFooter><Button className={styles.primary} onClick={() => model.setHelpOpen(false)}>{t("wordGame.close")}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={model.pendingLevel !== null} onOpenChange={open => { if (!open) model.setPendingLevel(null); }}><DialogContent className={styles.dialog} onCloseAutoFocus={event => { event.preventDefault(); model.input.restoreFocus(); }}><DialogHeader><DialogTitle>{t("wordGame.confirmTitle")}</DialogTitle><DialogDescription>{t("wordGame.confirmDescription")}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => model.setPendingLevel(null)}>{t("wordGame.cancel")}</Button><Button className={styles.primary} onClick={model.confirm}>{t("wordGame.confirm")}</Button></DialogFooter></DialogContent></Dialog>
  </main></MotionConfig>;
}
