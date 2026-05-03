"use client";

import * as React from "react";
import { Volume2, VolumeX } from "lucide-react";

import { Button } from "@/components/atoms/Button";
import { useAppI18n } from "@/hooks/useAppI18n";
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
  const clearPrizeResult = useLuckyDrawStore((state) => state.clearPrizeResult);
  const clearAllResults = useLuckyDrawStore((state) => state.clearAllResults);

  const { t } = useAppI18n();

  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [isMuted, setIsMuted] = React.useState(false);

  React.useEffect(() => {
    hydrate();
  }, [hydrate]);

  React.useEffect(() => {
    const audio = new Audio("/sounds/nhac-xo-so.mp3");
    audio.loop = true;
    audio.volume = 1;
    audioRef.current = audio;

    void audio.play().catch(() => undefined);

    return () => {
      audio.pause();
      audio.currentTime = 0;
      audioRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.muted = isMuted;
    if (!isMuted) {
      void audio.play().catch(() => undefined);
    }
  }, [isMuted]);

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

  const sortedPrizes = React.useMemo(
    () => [...config.prizes].sort((left, right) => left.order - right.order),
    [config.prizes],
  );
  const selectedPrize = sortedPrizes.find((prize) => prize.id === selectedPrizeId) ?? null;
  const selectedPrizeResult = selectedPrize
    ? results.find((result) => result.prizeId === selectedPrize.id) ?? null
    : null;

  return (
    <>
      <LuckyDrawDrawContent
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

      <div className="fixed bottom-6 right-6 z-30 flex items-center gap-2">
        <Button
          variant={isMuted ? "outline" : "secondary"}
          leftIcon={
            isMuted ? (
              <VolumeX className="size-4" aria-hidden />
            ) : (
              <Volume2 className="size-4" aria-hidden />
            )
          }
          onClick={() => setIsMuted((current) => !current)}
        >
          {isMuted ? t("luckyDraw.unmute") : t("luckyDraw.mute")}
        </Button>
      </div>
    </>
  );
}
