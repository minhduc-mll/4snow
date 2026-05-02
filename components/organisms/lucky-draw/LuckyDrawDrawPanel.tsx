"use client";

import * as React from "react";

import { LuckyDrawDrawContent } from "@/components/molecules/lucky-draw/LuckyDrawDrawContent";
import { useLuckyDrawStore } from "@/stores/useLuckyDrawStore";

export function LuckyDrawDrawPanel(): React.ReactElement {
  const hydrate = useLuckyDrawStore((state) => state.hydrate);
  const config = useLuckyDrawStore((state) => state.config);
  const results = useLuckyDrawStore((state) => state.results);
  const selectedPrizeId = useLuckyDrawStore((state) => state.selectedPrizeId);
  const setSelectedPrizeId = useLuckyDrawStore((state) => state.setSelectedPrizeId);
  const executeDraw = useLuckyDrawStore((state) => state.executeDraw);
  const storeErrorMessage = useLuckyDrawStore((state) => state.errorMessage);
  const clearError = useLuckyDrawStore((state) => state.clearError);
  const status = useLuckyDrawStore((state) => state.status);

  React.useEffect(() => {
    hydrate();
  }, [hydrate]);

  const sortedPrizes = React.useMemo(
    () => [...config.prizes].sort((left, right) => left.order - right.order),
    [config.prizes],
  );

  const selectedPrize = sortedPrizes.find((prize) => prize.id === selectedPrizeId) ?? null;
  const selectedPrizeResult = selectedPrize
    ? results.find((result) => result.prizeId === selectedPrize.id) ?? null
    : null;

  const clearPrizeResult = useLuckyDrawStore((state) => state.clearPrizeResult);
  const clearAllResults = useLuckyDrawStore((state) => state.clearAllResults);

  React.useEffect(() => {
    if (!storeErrorMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      clearError();
    }, 5000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [storeErrorMessage, clearError]);

  return (
    <>
      <LuckyDrawDrawContent
        key={`${selectedPrizeId ?? "none"}-${config.id}`}
        config={config}
        results={results}
        selectedPrize={selectedPrize}
        selectedPrizeResult={selectedPrizeResult}
        status={status}
        clearError={clearError}
        executeDraw={executeDraw}
        clearPrizeResult={clearPrizeResult}
        clearAllResults={clearAllResults}
        setSelectedPrizeId={setSelectedPrizeId}
      />

      {storeErrorMessage ? (
        <div className="pointer-events-none absolute right-4 top-4 z-20 rounded-full border border-info/25 bg-info/10 px-4 py-2 text-sm text-info-foreground shadow-lg shadow-black/10">
          {storeErrorMessage}
        </div>
      ) : null}
    </>
  );
}
