"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Maximize2, Play, RotateCw, Trophy } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/atoms/Badge";
import { Button } from "@/components/atoms/Button";
import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/atoms/Card";
import { DrawResultDialog } from "@/components/molecules/lucky-draw/DrawResultDialog";
import { DrawHistoryItem } from "@/components/molecules/lucky-draw/DrawHistoryItem";
import { LuckyDrawExpandedDrawDialog } from "@/components/molecules/lucky-draw/LuckyDrawExpandedDrawDialog";
import { ResultGrid } from "@/components/molecules/lucky-draw/ResultGrid";
import { SpinRevealBox } from "@/components/molecules/lucky-draw/SpinRevealBox";
import { useAppI18n } from "@/hooks/useAppI18n";
import {
    collectPreviousWinners,
    formatTicket,
    getAvailableTicketCount,
    getDisplayDigits,
    largeWinnerAnimationThreshold,
    luckyDrawDecelerationEase,
} from "@/hooks/useLuckyDraw";
import type {
    LuckyDrawConfig,
    LuckyDrawDrawResult,
    LuckyDrawPrize,
    LuckyDrawStatus,
} from "@/types/lucky-draw";

type RevealMode = "first_only" | "every";

const DIGIT_ITEM_HEIGHT = 144;
const DIGIT_DURATION_BASE = 2.2;
const DIGIT_DURATION_POSITION_STEP = 0.56;
const REVEAL_DELAY_BUFFER_SECONDS = 0.7;

function getDigitSequence(targetDigit: string, position: number): string[] {
    const target = Number(targetDigit);
    const sequenceLength = 8 * 10 + position * 10 + target + 1;
    return Array.from({ length: sequenceLength }, (_, index) => String(index % 10));
}

function getDigitDuration(position: number): number {
    return DIGIT_DURATION_BASE + position * DIGIT_DURATION_POSITION_STEP;
}

function getRevealDelayMs(lastPosition: number): number {
    return Math.round(
        (getDigitDuration(lastPosition) + REVEAL_DELAY_BUFFER_SECONDS) * 1_000,
    );
}

interface LuckyDrawDrawContentProps {
    config: LuckyDrawConfig;
    results: LuckyDrawDrawResult[];
    selectedPrize: LuckyDrawPrize | null;
    selectedPrizeResult: LuckyDrawDrawResult | null;
    status: LuckyDrawStatus;
    clearError: () => void;
    executeDraw: (prizeId: string) => Promise<LuckyDrawDrawResult>;
    clearPrizeResult: (prizeId: string) => void;
    clearAllResults: () => void;
    setSelectedPrizeId: (prizeId: string | null) => void;
}

export const LuckyDrawDrawContent = ({
    config,
    results,
    selectedPrize,
    selectedPrizeResult,
    status,
    clearError,
    executeDraw,
    clearPrizeResult,
    clearAllResults,
    setSelectedPrizeId,
}: LuckyDrawDrawContentProps): React.ReactElement => {
    const { t } = useAppI18n();
    const [activeDraw, setActiveDraw] = React.useState<LuckyDrawDrawResult | null>(null);
    const [revealWinnerIndex, setRevealWinnerIndex] = React.useState(0);
    const [isRevealing, setIsRevealing] = React.useState(false);
    const [revealedWinners, setRevealedWinners] = React.useState<string[]>([]);
    const [revealMode, setRevealMode] = React.useState<RevealMode>("every");
    const [localError, setLocalError] = React.useState<string | null>(null);
    const [isResultDialogOpen, setIsResultDialogOpen] = React.useState(false);
    const [isExpandedDrawOpen, setIsExpandedDrawOpen] = React.useState(false);
    const shownResultDialogForDrawRef = React.useRef<string | null>(null);
    const resultDialogTimeoutRef = React.useRef<number | null>(null);

    const sortedPrizes = React.useMemo(
        () => [...config.prizes].sort((left, right) => left.order - right.order),
        [config.prizes],
    );
    const displayDigits = getDisplayDigits(config.ticketRange.to);
    const rangeLabel = `${formatTicket(config.ticketRange.from, displayDigits)} - ${formatTicket(
        config.ticketRange.to,
        displayDigits,
    )}`;
    const exclusionCount = config.ticketRange.except.length;
    const previousWinners = collectPreviousWinners(results);
    const availableTicketCount = getAvailableTicketCount(config, previousWinners);

    const historyResults = React.useMemo(() => {
        if (!isRevealing || !selectedPrize) {
            return results;
        }

        return results.filter((result) => result.prizeId !== selectedPrize.id);
    }, [results, isRevealing, selectedPrize]);

    const currentWinner =
        activeDraw?.winners[revealWinnerIndex] ??
        selectedPrizeResult?.winners[0] ??
        "0".repeat(Math.max(1, displayDigits));

    const shouldAnimateCurrent =
        activeDraw !== null &&
        isRevealing &&
        activeDraw.winners.length <= largeWinnerAnimationThreshold;

    const canDraw =
        Boolean(selectedPrize) &&
        !selectedPrizeResult &&
        status !== "drawing" &&
        !isRevealing;

    React.useEffect(() => {
        if (!activeDraw || !isRevealing) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            if (revealMode === "first_only") {
                setRevealedWinners(activeDraw.winners);
                setIsRevealing(false);
                return;
            }

            const current = activeDraw.winners[revealWinnerIndex];
            if (current) {
                setRevealedWinners((list) => [...list, current]);
            }

            const nextIndex = revealWinnerIndex + 1;
            if (nextIndex >= activeDraw.winners.length) {
                setIsRevealing(false);
                return;
            }

            setRevealWinnerIndex(nextIndex);
        }, getRevealDelayMs(displayDigits - 1));

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [activeDraw, displayDigits, isRevealing, revealMode, revealWinnerIndex]);

    React.useEffect(() => {
        if (!activeDraw || isRevealing) {
            return;
        }

        const visibleWinners =
            revealedWinners.length > 0 ? revealedWinners : activeDraw.winners;
        const isCompleted = visibleWinners.length === activeDraw.winners.length;
        const isAlreadyShown = shownResultDialogForDrawRef.current === activeDraw.id;

        if (!isCompleted || isAlreadyShown) {
            return;
        }

        shownResultDialogForDrawRef.current = activeDraw.id;
        resultDialogTimeoutRef.current = window.setTimeout(() => {
            setIsExpandedDrawOpen(false);
            setIsResultDialogOpen(true);
            resultDialogTimeoutRef.current = null;
        }, 0);

        return () => {
            if (resultDialogTimeoutRef.current !== null) {
                window.clearTimeout(resultDialogTimeoutRef.current);
                resultDialogTimeoutRef.current = null;
            }
        };
    }, [activeDraw, isRevealing, revealedWinners]);

    const handlePrizeSelect = (prizeId: string): void => {
        clearError();
        setSelectedPrizeId(prizeId);
    };

    const resetRevealState = (): void => {
        setActiveDraw(null);
        setRevealWinnerIndex(0);
        setIsRevealing(false);
        setRevealedWinners([]);
        setIsResultDialogOpen(false);
        shownResultDialogForDrawRef.current = null;

        if (resultDialogTimeoutRef.current !== null) {
            window.clearTimeout(resultDialogTimeoutRef.current);
            resultDialogTimeoutRef.current = null;
        }
    };

    const handleExecuteDraw = async (): Promise<void> => {
        if (!selectedPrize) {
            setLocalError("Select a prize before drawing.");
            return;
        }

        setLocalError(null);
        resetRevealState();

        try {
            const result = await executeDraw(selectedPrize.id);
            setActiveDraw(result);
            setRevealedWinners([]);
            setIsRevealing(
                result.winners.length > 0 &&
                result.winners.length <= largeWinnerAnimationThreshold,
            );

            if (result.winners.length > largeWinnerAnimationThreshold) {
                setRevealedWinners(result.winners);
            }
        } catch (error) {
            setLocalError(
                error instanceof Error
                    ? error.message
                    : "Unable to execute draw. Please try again.",
            );
        }
    };

    const handleClearSelectedPrizeResult = (): void => {
        if (!selectedPrizeResult || !selectedPrize) {
            return;
        }

        clearError();
        setLocalError(null);
        resetRevealState();
        clearPrizeResult(selectedPrize.id);
    };

    const handleClearAllResults = (): void => {
        clearError();
        setLocalError(null);
        resetRevealState();
        clearAllResults();
    };

    const handleResultDialogOpenChange = (open: boolean): void => {
        setIsResultDialogOpen(open);
    };

    return (
        <Card noAnimate className="w-full border-white/20 bg-white/60 shadow-soft backdrop-blur-md dark:bg-slate-950/30">
            <CardHeader>
                <CardTitle></CardTitle>
                <CardDescription hidden>
                    Run the draw using the saved local configuration.
                </CardDescription>
                <CardAction>
                    <Badge variant={selectedPrizeResult ? "success" : "outline"}>
                        {selectedPrizeResult ? t("luckyDraw.drawn") : t("luckyDraw.ready")}
                    </Badge>
                </CardAction>
            </CardHeader>

            <CardContent className="grid gap-6 lg:grid-cols-[1.9fr_1fr]">
                <div className="grid gap-4">
                    <div className="grid gap-4 rounded-lg border bg-white/10 p-6 min-h-136 dark:bg-slate-950/20">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h2 className="text-base font-semibold text-foreground">
                                    {selectedPrize?.name ?? "-"}
                                </h2>
                                <p className="text-sm text-muted-foreground hidden">
                                    Winners: {selectedPrize?.winners_count ?? 0} · Range: {rangeLabel}
                                </p>
                            </div>
                            <div className="flex grow items-center justify-between gap-4">
                                {selectedPrizeResult ? (
                                    <Badge variant="success">{t("luckyDraw.drawn")}</Badge>
                                ) : null}

                                <Button
                                    variant="outline"
                                    size="icon"
                                    aria-label={t("luckyDraw.expand")}
                                    onClick={() => setIsExpandedDrawOpen(true)}
                                    disabled={!selectedPrize || status === "drawing" || isRevealing}
                                    className="ml-auto"
                                >
                                    <Maximize2 className="size-4" aria-hidden />
                                </Button>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-center gap-4 rounded-xl border border-muted/50 bg-white/10 p-6 shadow-sm sm:gap-6 sm:p-8 dark:bg-slate-950/20">
                            {currentWinner.split("").map((digit, index) => (
                                <SpinRevealBox<string>
                                    key={`${activeDraw?.id ?? "idle"}-${revealWinnerIndex}-${index}`}
                                    item={digit}
                                    position={index}
                                    requestId={`${activeDraw?.id ?? "idle"}-${revealWinnerIndex}`}
                                    isAnimated={shouldAnimateCurrent}
                                    itemHeight={DIGIT_ITEM_HEIGHT}
                                    ease={luckyDrawDecelerationEase}
                                    buildSequence={getDigitSequence}
                                    getDuration={getDigitDuration}
                                    getRevealDelayMs={getRevealDelayMs}
                                    animatedClassName="size-36 overflow-hidden rounded-lg border bg-white/10 shadow-inner dark:bg-slate-950/20"
                                    staticClassName="flex size-36 items-center justify-center rounded-lg border bg-white/10 font-mono text-8xl font-semibold tabular-nums shadow-inner dark:bg-slate-950/20"
                                    className="will-change-transform"
                                    renderItem={(item) => (
                                        <div className="flex h-36 items-center justify-center font-mono text-8xl font-semibold tabular-nums">
                                            {item}
                                        </div>
                                    )}
                                />
                            ))}
                        </div>

                        <AnimatePresence mode="wait">
                            {activeDraw ? (
                                <motion.div
                                    key={activeDraw.id}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -4 }}
                                    transition={{ duration: 0.2, ease: "easeOut" }}
                                    className="grid gap-3 h-55"
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                                            <Trophy className="size-4" aria-hidden />
                                            {t("luckyDraw.winners")}
                                        </div>
                                        <Badge variant={isRevealing ? "warning" : "success"}>
                                            {isRevealing
                                                ? `Revealing ${Math.min(revealedWinners.length + 1, activeDraw.winners.length)}/${activeDraw.winners.length}`
                                                : t("luckyDraw.complete")}
                                        </Badge>
                                    </div>
                                    {isRevealing && revealedWinners.length === 0 ? (
                                        <div className="rounded-lg border border-dashed border-muted/40 bg-muted/40 p-8.5 text-center text-sm text-muted-foreground">
                                            {t("luckyDraw.resultAppearAfterReveal")}
                                        </div>
                                    ) : (
                                        <ResultGrid
                                            isShow={revealedWinners.length > 0}
                                            winners={revealedWinners}
                                        />
                                    )}
                                </motion.div>
                            ) : selectedPrizeResult ? (
                                <motion.div
                                    key={selectedPrizeResult.id}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -4 }}
                                    transition={{ duration: 0.2, ease: "easeOut" }}
                                    className="grid gap-3 h-55"
                                >
                                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                                        <Trophy className="size-4" aria-hidden />
                                        {t("luckyDraw.savedResult")}
                                    </div>
                                    <ResultGrid winners={selectedPrizeResult.winners} />
                                </motion.div>
                            ) : (
                                <div className="grid gap-3 h-55">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                                            <Trophy className="size-4" aria-hidden />
                                            {t("luckyDraw.winners")}
                                        </div>
                                        <Badge variant="info">{t("luckyDraw.waitForResult")}</Badge>
                                    </div>
                                    <div className="rounded-lg border border-dashed border-muted/40 bg-muted/40 p-8.5 text-center text-sm text-muted-foreground">
                                        {t("luckyDraw.resultAppearAfterDraw")}
                                    </div>
                                </div>
                            )}
                        </AnimatePresence>

                        <div className="grow" />
                    </div>

                    {!!localError ? (
                        <Badge variant="danger" className="w-fit">
                            {localError}
                        </Badge>
                    ) : null}
                </div>

                <aside className="grid gap-4">
                    <div className="flex flex-col gap-3 rounded-lg border bg-white/10 p-4 dark:bg-slate-950/20">
                        <h2 className="text-base font-semibold text-foreground">{t("luckyDraw.selectedPrize")}</h2>
                        <label className="flex flex-col gap-1.5 text-sm">
                            <span className="font-medium text-foreground">{t("luckyDraw.prize")}</span>
                            <select
                                className="h-10 rounded-lg border border-input bg-white/10 px-3 text-sm cursor-pointer dark:bg-slate-950/20"
                                value={selectedPrize?.id ?? ""}
                                onChange={(event) => handlePrizeSelect(event.target.value)}
                            >
                                {sortedPrizes.map((prize) => {
                                    const hasResult = results.some((result) => result.prizeId === prize.id);
                                    const prefix = hasResult ? "✓ " : "  ";

                                    return (
                                        <option
                                            key={prize.id}
                                            value={prize.id}
                                            style={
                                                hasResult
                                                    ? { backgroundColor: "rgba(56, 189, 248, 0.1)" }
                                                    : undefined
                                            }
                                        >
                                            {prefix}{prize.name}
                                        </option>
                                    );
                                })}
                            </select>
                        </label>

                        <div className="grid gap-2 pt-2">
                            <span className="text-sm font-medium text-foreground">{t("luckyDraw.revealMode")}</span>
                            <div className="grid grid-cols-2 gap-2">
                                <Button
                                    variant={revealMode === "first_only" ? "primary" : "outline"}
                                    disabled={isRevealing || status === "drawing"}
                                    onClick={() => setRevealMode("first_only")}
                                >
                                    {t("luckyDraw.firstOnly")}
                                </Button>
                                <Button
                                    variant={revealMode === "every" ? "primary" : "outline"}
                                    disabled={isRevealing || status === "drawing"}
                                    onClick={() => setRevealMode("every")}
                                >
                                    {t("luckyDraw.everyResult")}
                                </Button>
                            </div>
                        </div>

                        <div className="hidden pt-2 text-sm text-muted-foreground">
                            <div>Range: {rangeLabel}</div>
                            <div>{displayDigits} digits</div>
                            <div>{exclusionCount} excluded</div>
                            <div>{availableTicketCount} available</div>
                        </div>
                    </div>

                    <div className="grid gap-3 rounded-lg border bg-white/10 p-4 dark:bg-slate-950/20">
                        <h2 className="text-base font-semibold text-foreground">{t("luckyDraw.previousResults")}</h2>
                        {historyResults.length > 0 ? (
                            <motion.div
                                key={`${selectedPrize?.id ?? "none"}-${historyResults.length}`}
                                className="grid gap-3"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.2, ease: "easeOut" }}
                            >
                                {historyResults.map((result) => (
                                    <motion.div
                                        key={result.id}
                                        layout
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.2, ease: "easeOut" }}
                                    >
                                        <DrawHistoryItem result={result} />
                                    </motion.div>
                                ))}
                            </motion.div>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                {t("luckyDraw.noSavedResults")}
                            </p>
                        )}
                    </div>
                </aside>
            </CardContent>

            <CardFooter className="justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                    <Button
                        variant="outline"
                        disabled={!selectedPrizeResult}
                        onClick={handleClearSelectedPrizeResult}
                    >
                        {t("luckyDraw.clearCurrentResult")}
                    </Button>
                    <Button
                        variant="danger"
                        disabled={results.length === 0}
                        onClick={handleClearAllResults}
                    >
                        {t("luckyDraw.clearAllResults")}
                    </Button>
                </div>
                <Button
                    size="lg"
                    disabled={!canDraw}
                    isLoading={status === "drawing" || isRevealing}
                    leftIcon={
                        status === "drawing" || isRevealing ? (
                            <RotateCw className="size-4" aria-hidden />
                        ) : (
                            <Play className="size-4" aria-hidden />
                        )
                    }
                    onClick={handleExecuteDraw}
                    className="px-8"
                >
                    {t("luckyDraw.draw")}
                </Button>
            </CardFooter>

            <LuckyDrawExpandedDrawDialog
                open={isExpandedDrawOpen}
                onOpenChange={setIsExpandedDrawOpen}
                prizeName={selectedPrize?.name ?? "-"}
                digits={currentWinner}
                requestId={`${activeDraw?.id ?? "idle"}-${revealWinnerIndex}`}
                isAnimated={shouldAnimateCurrent}
                isLoading={status === "drawing" || isRevealing}
                canDraw={canDraw}
                drawLabel={t("luckyDraw.draw")}
                onDraw={() => {
                    void handleExecuteDraw();
                }}
                getDigitSequence={getDigitSequence}
                getDigitDuration={getDigitDuration}
                getRevealDelayMs={getRevealDelayMs}
                ease={luckyDrawDecelerationEase}
            />

            <DrawResultDialog
                open={isResultDialogOpen}
                onOpenChange={handleResultDialogOpenChange}
                winnersDescription={t("luckyDraw.winnersWithPrize", {
                    prizeName: selectedPrize?.name ?? "-",
                })}
                title={t("luckyDraw.drawComplete")}
                closeLabel={t("luckyDraw.close")}
                winners={
                    activeDraw?.winners ??
                    selectedPrizeResult?.winners ??
                    revealedWinners
                }
            />
        </Card>
    );
};
