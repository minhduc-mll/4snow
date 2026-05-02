"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Play, RotateCw, Trophy } from "lucide-react";
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

const digitItemHeight = 80;

function getDigitSequence(targetDigit: string, position: number): string[] {
    const target = Number(targetDigit);
    const sequenceLength = 8 * 10 + position * 10 + target + 1;

    return Array.from({ length: sequenceLength }, (_, index) => String(index % 10));
}

function getDigitDuration(position: number): number {
    return 1.1 + position * 0.28;
}

function getRevealDelayMs(displayDigits: number): number {
    return Math.round((getDigitDuration(displayDigits - 1) + 0.35) * 1_000);
}

function DigitBox({
    digit,
    position,
    requestId,
    isAnimated,
}: {
    digit: string;
    position: number;
    requestId: string;
    isAnimated: boolean;
}): React.ReactElement {
    const sequence = React.useMemo(
        () => getDigitSequence(digit, position),
        [digit, position],
    );
    const targetY = -(sequence.length - 1) * digitItemHeight; // digitItemHeight = 80

    if (!isAnimated) {
        return (
            <div className={`flex size-20 items-center justify-center rounded-lg border bg-background font-mono text-3xl font-semibold tabular-nums shadow-inner`}>
                {digit}
            </div>
        );
    }

    return (
        <div className={`size-20 overflow-hidden rounded-lg border bg-background shadow-inner`}>
            <motion.div
                key={`${requestId}-${position}-${digit}`}
                initial={{ y: 0 }}
                animate={{ y: targetY }}
                transition={{
                    duration: getDigitDuration(position),
                    ease: luckyDrawDecelerationEase,
                }}
                className="will-change-transform"
            >
                {sequence.map((item, index) => (
                    <div
                        key={`${requestId}-${position}-${index}`}
                        className="flex h-20 items-center justify-center font-mono text-3xl font-semibold tabular-nums"
                    >
                        {item}
                    </div>
                ))}
            </motion.div>
        </div>
    );
}

function ResultGrid({
    isShow = true,
    winners,
    compact = false,
}: {
    isShow?: boolean;
    winners: string[];
    compact?: boolean;
}): React.ReactElement {
    if (!isShow) {
        return <div className="size-14" />;
    }

    return (
        <div
            className={`flex flex-wrap items-center justify-start gap-2 ${compact ? "max-h-60" : "max-h-96"} overflow-auto`}
        >
            {winners.map((winner) => (
                <div
                    key={winner}
                    className={`aspect-square w-full rounded-lg border bg-background grid place-items-center font-mono text-lg font-semibold tabular-nums shadow-inner ${compact ? "max-w-15" : "max-w-22.5"}`}
                >
                    {winner}
                </div>
            ))}
        </div>
    );
}

function HistoryItem({ result }: { result: LuckyDrawDrawResult }): React.ReactElement {
    return (
        <div className="grid gap-2 rounded-lg border bg-background p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <p className="font-medium text-foreground">{result.prizeName}</p>
                    <p className="text-xs text-muted-foreground">
                        {new Date(result.createdAt).toLocaleString()}
                    </p>
                </div>
                <Badge variant="success">{result.winners.length} winners</Badge>
            </div>
            <ResultGrid winners={result.winners} compact />
        </div>
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
    const [activeDraw, setActiveDraw] = React.useState<LuckyDrawDrawResult | null>(null);
    const [revealWinnerIndex, setRevealWinnerIndex] = React.useState(0);
    const [isRevealing, setIsRevealing] = React.useState(false);
    const [localError, setLocalError] = React.useState<string | null>(null);

    const revealTimes = 1

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
            setRevealWinnerIndex((currentIndex) => {
                const nextIndex = currentIndex + 1;

                if (nextIndex >= revealTimes || nextIndex >= activeDraw.winners.length) {
                    setIsRevealing(false);
                    return currentIndex;
                }

                return nextIndex;
            });
        }, getRevealDelayMs(displayDigits));

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [activeDraw, displayDigits, isRevealing, revealWinnerIndex]);

    const handlePrizeSelect = (prizeId: string): void => {
        clearError();
        setSelectedPrizeId(prizeId);
    };

    const handleExecuteDraw = async (): Promise<void> => {
        if (!selectedPrize) {
            setLocalError("Select a prize before drawing.");
            return;
        }

        setLocalError(null);
        setActiveDraw(null);
        setRevealWinnerIndex(0);
        setIsRevealing(false);

        try {
            const result = await executeDraw(selectedPrize.id);
            setActiveDraw(result);
            setIsRevealing(
                result.winners.length > 0 &&
                result.winners.length <= largeWinnerAnimationThreshold,
            );
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
        setActiveDraw(null);
        setRevealWinnerIndex(0);
        setIsRevealing(false);
        clearPrizeResult(selectedPrize.id);
    };

    const handleClearAllResults = (): void => {
        clearError();
        setLocalError(null);
        setActiveDraw(null);
        setRevealWinnerIndex(0);
        setIsRevealing(false);
        clearAllResults();
    };

    return (
        <Card noAnimate className="w-full shadow-soft">
            <CardHeader>
                <CardTitle>Lucky Draw</CardTitle>
                <CardDescription hidden>
                    Run the draw using the saved local configuration.
                </CardDescription>
                <CardAction>
                    <Badge variant={selectedPrizeResult ? "success" : "outline"}>
                        {selectedPrizeResult ? "Drawn" : "Ready"}
                    </Badge>
                </CardAction>
            </CardHeader>

            <CardContent className="grid gap-6 lg:grid-cols-[1.9fr_1fr]">
                <div className="grid gap-4">
                    <div className="grid gap-4 rounded-lg border bg-muted/20 p-6 min-h-136">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h2 className="text-base font-semibold text-foreground">
                                    Now Drawing: {selectedPrize?.name ?? "No prize selected"}
                                </h2>
                                <p className="text-sm text-muted-foreground hidden">
                                    Winners: {selectedPrize?.winners_count ?? 0} · Range: {rangeLabel}
                                </p>
                            </div>
                            {selectedPrizeResult ? (
                                <Badge variant="success">This prize has already been drawn</Badge>
                            ) : null}
                        </div>

                        <div className="flex flex-wrap items-center justify-center gap-4 rounded-xl border border-muted/50 bg-background p-6 shadow-sm sm:gap-6 sm:p-8">
                            {currentWinner.split("").map((digit, index) => (
                                <DigitBox
                                    key={`${activeDraw?.id ?? "idle"}-${revealWinnerIndex}-${index}`}
                                    digit={digit}
                                    position={index}
                                    requestId={`${activeDraw?.id ?? "idle"}-${revealWinnerIndex}`}
                                    isAnimated={shouldAnimateCurrent}
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
                                    className="grid gap-3 h-44"
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                                            <Trophy className="size-4" aria-hidden />
                                            Winners
                                        </div>
                                        <Badge variant={isRevealing ? "warning" : "success"}>
                                            {isRevealing
                                                ? `Revealing ${revealWinnerIndex + 1}/${Math.min(revealTimes, activeDraw.winners.length)}`
                                                : "Complete"}
                                        </Badge>
                                    </div>
                                    {isRevealing ? (
                                        <div className="rounded-lg border border-dashed border-muted/40 bg-muted/40 p-8.5 text-center text-sm text-muted-foreground">
                                            Results will appear when the reveal is complete.
                                        </div>
                                    ) : (
                                        <ResultGrid winners={activeDraw.winners} />
                                    )}
                                </motion.div>
                            ) : selectedPrizeResult ? (
                                <motion.div
                                    key={selectedPrizeResult.id}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -4 }}
                                    transition={{ duration: 0.2, ease: "easeOut" }}
                                    className="grid gap-3 h-44"
                                >
                                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                                        <Trophy className="size-4" aria-hidden />
                                        Saved result
                                    </div>
                                    <ResultGrid winners={selectedPrizeResult.winners} />
                                </motion.div>
                            ) : (
                                <div className="grid gap-3 h-44">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                                            <Trophy className="size-4" aria-hidden />
                                            Winners
                                        </div>
                                        <Badge variant={"info"}>
                                            Wait for it...
                                        </Badge>
                                    </div>
                                    <div className="rounded-lg border border-dashed border-muted/40 bg-muted/40 p-8.5 text-center text-sm text-muted-foreground">
                                        Results will appear after the draw is complete.
                                    </div>
                                </div>
                            )}
                        </AnimatePresence>

                        <div className="grow"></div>
                    </div>

                    {!!localError ? (
                        <Badge variant="danger" className="w-fit">
                            {localError}
                        </Badge>
                    ) : null}
                </div>

                <aside className="grid gap-4">
                    <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4">
                        <h2 className="text-base font-semibold text-foreground">Selected Prize</h2>
                        <label className="flex flex-col gap-1.5 text-sm">
                            <span className="font-medium text-foreground">Prize</span>
                            <select
                                className="h-10 rounded-lg border border-input bg-background px-3 text-sm cursor-pointer"
                                value={selectedPrize?.id ?? ""}
                                onChange={(event) => handlePrizeSelect(event.target.value)}
                            >
                                {sortedPrizes.map((prize) => {
                                    const hasResult = results.some((result) => result.prizeId === prize.id);
                                    const prefix = hasResult ? "✓\u00A0" : "\u00A0\u00A0\u00A0\u00A0";

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

                        <div className="hidden pt-2 text-sm text-muted-foreground">
                            <div>Range: {rangeLabel}</div>
                            <div>{displayDigits} digits</div>
                            <div>{exclusionCount} excluded</div>
                            <div>{availableTicketCount} available</div>
                        </div>
                    </div>

                    <div className="grid gap-3 rounded-lg border bg-muted/20 p-4">
                        <h2 className="text-base font-semibold text-foreground">Previous Results</h2>
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
                                        <HistoryItem result={result} />
                                    </motion.div>
                                ))}
                            </motion.div>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                No saved draw results yet.
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
                        Clear current result
                    </Button>
                    <Button
                        variant="danger"
                        disabled={results.length === 0}
                        onClick={handleClearAllResults}
                    >
                        Clear all results
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
                >
                    Draw
                </Button>
            </CardFooter>
        </Card>
    );
}
