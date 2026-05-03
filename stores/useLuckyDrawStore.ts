"use client";

import { create } from "zustand";
import { devtools } from "zustand/middleware";

import type {
  LuckyDrawConfig,
  LuckyDrawDrawResult,
  LuckyDrawStatus,
} from "@/types/lucky-draw";
import {
  LUCKY_DRAW_CONFIG_STORAGE_KEY,
  LUCKY_DRAW_LEGACY_STORAGE_KEY,
  LUCKY_DRAW_RESULTS_STORAGE_KEY,
  collectPreviousWinners,
  createDefaultLuckyDrawConfig,
  getCandidateTickets,
  getDisplayDigits,
  normalizeExceptValues,
  pickWinners,
  validateDrawConfigInput,
} from "@/hooks/useLuckyDraw";

export interface LuckyDrawStoreState {
  hydrated: boolean;
  config: LuckyDrawConfig;
  results: LuckyDrawDrawResult[];
  selectedPrizeId: string | null;
  status: LuckyDrawStatus;
  errorMessage: string | null;
}

export interface LuckyDrawStoreActions {
  hydrate: () => void;
  saveConfig: (config: LuckyDrawConfig) => void;
  setSelectedPrizeId: (prizeId: string | null) => void;
  executeDraw: (prizeId: string) => Promise<LuckyDrawDrawResult>;
  clearPrizeResult: (prizeId: string) => void;
  clearAllResults: () => void;
  clearError: () => void;
}

export type LuckyDrawStore = LuckyDrawStoreState & LuckyDrawStoreActions;

const defaultConfig = createDefaultLuckyDrawConfig();

const defaultState: LuckyDrawStoreState = {
  hydrated: false,
  config: defaultConfig,
  results: [],
  selectedPrizeId: defaultConfig.prizes[0]?.id ?? null,
  status: "idle",
  errorMessage: null,
};

function isIsoDateTime(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function normalizeStoredResults(
  rawResults: unknown,
  config: LuckyDrawConfig,
): LuckyDrawDrawResult[] {
  if (!Array.isArray(rawResults)) {
    return [];
  }

  const prizeIds = new Set(config.prizes.map((prize) => prize.id));
  const displayDigits = getDisplayDigits(config.ticketRange.to);
  const existingWinners = new Set<string>();

  const normalized = rawResults.reduce<LuckyDrawDrawResult[]>((acc, item) => {
    if (!item || typeof item !== "object") {
      return acc;
    }

    const result = item as LuckyDrawDrawResult;

    if (
      typeof result.id !== "string" ||
      typeof result.configId !== "string" ||
      typeof result.prizeId !== "string" ||
      typeof result.prizeName !== "string" ||
      !Array.isArray(result.winners) ||
      !result.winners.every((winner) => typeof winner === "string") ||
      typeof result.createdAt !== "string" ||
      !isIsoDateTime(result.createdAt) ||
      typeof result.drawSettingsSnapshot !== "object" ||
      result.drawSettingsSnapshot === null
    ) {
      return acc;
    }

    if (result.configId !== config.id) {
      return acc;
    }

    if (!prizeIds.has(result.prizeId)) {
      return acc;
    }

    const snapshot = result.drawSettingsSnapshot;
    const snapshotValid =
      typeof snapshot.from === "number" &&
      typeof snapshot.to === "number" &&
      Number.isInteger(snapshot.from) &&
      Number.isInteger(snapshot.to) &&
      snapshot.from >= 0 &&
      snapshot.to >= 0 &&
      typeof snapshot.displayDigits === "number" &&
      Number.isInteger(snapshot.displayDigits) &&
      snapshot.displayDigits >= 1 &&
      Array.isArray(snapshot.except) &&
      snapshot.except.every((ticket) => typeof ticket === "string") &&
      typeof snapshot.winners_count === "number" &&
      Number.isInteger(snapshot.winners_count) &&
      snapshot.winners_count > 0;

    if (!snapshotValid) {
      return acc;
    }

    const winners = result.winners.map((winner) => winner.trim());

    if (
      winners.length !== new Set(winners).size ||
      winners.some(
        (winner) =>
          !/^[0-9]+$/.test(winner) ||
          winner.length !== displayDigits ||
          Number(winner) < config.ticketRange.from ||
          Number(winner) > config.ticketRange.to ||
          config.ticketRange.except.includes(winner),
      )
    ) {
      return acc;
    }

    for (const winner of winners) {
      if (existingWinners.has(winner)) {
        return acc;
      }
    }

    winners.forEach((winner) => existingWinners.add(winner));

    acc.push({
      id: result.id,
      configId: result.configId,
      prizeId: result.prizeId,
      prizeName: result.prizeName,
      winners,
      drawSettingsSnapshot: {
        from: snapshot.from,
        to: snapshot.to,
        displayDigits: snapshot.displayDigits,
        except: snapshot.except,
        winners_count: snapshot.winners_count,
      },
      createdAt: result.createdAt,
    });

    return acc;
  }, []);

  return normalized;
}

function loadStoredLuckyDrawState(): {
  config: LuckyDrawConfig;
  results: LuckyDrawDrawResult[];
  errorMessage: string | null;
} {
  if (typeof window === "undefined") {
    return {
      config: defaultConfig,
      results: [],
      errorMessage: null,
    };
  }

  const configRaw = window.localStorage.getItem(LUCKY_DRAW_CONFIG_STORAGE_KEY);
  const resultsRaw = window.localStorage.getItem(LUCKY_DRAW_RESULTS_STORAGE_KEY);
  const legacyRaw = window.localStorage.getItem(LUCKY_DRAW_LEGACY_STORAGE_KEY);

  if (!configRaw && !resultsRaw && !legacyRaw) {
    saveLuckyDrawState(defaultConfig, []);
    return {
      config: defaultConfig,
      results: [],
      errorMessage: null,
    };
  }

  try {
    const parsedConfig = configRaw ? JSON.parse(configRaw) : null;
    const parsedResults = resultsRaw ? JSON.parse(resultsRaw) : null;
    const parsedLegacy = legacyRaw ? JSON.parse(legacyRaw) : null;
    const rawConfig = parsedConfig?.config ?? parsedLegacy?.config;
    const config = normalizeStoredConfig(rawConfig);

    if (!config) {
      throw new Error("Invalid saved configuration");
    }

    const rawResults = parsedResults?.results ?? parsedLegacy?.results;
    const normalizedResults = normalizeStoredResults(rawResults, config);
    return {
      config,
      results: normalizedResults,
      errorMessage:
        normalizedResults.length === 0 && rawResults
          ? "The default configuration has been set."
          : null,
    };
  } catch {
    return {
      config: defaultConfig,
      results: [],
      errorMessage: "The default configuration has been set.",
    };
  }
}

function normalizeStoredConfig(rawConfig: unknown): LuckyDrawConfig | null {
  if (!rawConfig || typeof rawConfig !== "object") {
    return null;
  }

  const configRecord = rawConfig as Record<string, unknown>;

  if (
    typeof configRecord.id !== "string" ||
    typeof configRecord.name !== "string" ||
    typeof configRecord.ticketRange !== "object" ||
    configRecord.ticketRange === null ||
    !Array.isArray(configRecord.prizes)
  ) {
    return null;
  }

  const ticketRangeRecord = configRecord.ticketRange as Record<string, unknown>;
  const from = Number.isInteger(ticketRangeRecord.from)
    ? (ticketRangeRecord.from as number)
    : null;
  const to = Number.isInteger(ticketRangeRecord.to)
    ? (ticketRangeRecord.to as number)
    : null;
  const except = Array.isArray(ticketRangeRecord.except)
    ? ticketRangeRecord.except.filter((item) => typeof item === "string")
    : [];

  if (from === null || to === null) {
    return null;
  }

  const prizeItems = configRecord.prizes
    .map((prize) => {
      if (!prize || typeof prize !== "object") {
        return null;
      }

      const prizeRecord = prize as Record<string, unknown>;

      if (
        typeof prizeRecord.id !== "string" ||
        typeof prizeRecord.name !== "string" ||
        !Number.isInteger(prizeRecord.winners_count) ||
        !Number.isInteger(prizeRecord.order)
      ) {
        return null;
      }

      return {
        id: prizeRecord.id.trim() || `prize-${prizeRecord.order}`,
        name: prizeRecord.name.trim(),
        winners_count: prizeRecord.winners_count,
        order: prizeRecord.order,
      };
    })
    .filter(
      (
        prize,
      ): prize is {
        id: string;
        name: string;
        winners_count: number;
        order: number;
      } => Boolean(prize),
    );

  const candidateConfig: LuckyDrawConfig = {
    id: configRecord.id,
    name: configRecord.name.trim(),
    ticketRange: {
      from,
      to,
      except,
    },
    prizes: prizeItems,
  };

  const errors = validateDrawConfigInput(candidateConfig);

  if (errors.length > 0) {
    return null;
  }

  try {
    const normalizedExcept = normalizeExceptValues(
      candidateConfig.ticketRange.except,
      candidateConfig.ticketRange.from,
      candidateConfig.ticketRange.to,
    );

    return {
      ...candidateConfig,
      ticketRange: {
        ...candidateConfig.ticketRange,
        except: normalizedExcept,
      },
    };
  } catch {
    return null;
  }
}

function saveLuckyDrawState(
  config: LuckyDrawConfig,
  results: LuckyDrawDrawResult[],
): void {
  if (typeof window === "undefined") {
    return;
  }

  const configPayload = {
    version: 1,
    config,
    updatedAt: new Date().toISOString(),
  };
  const resultsPayload = {
    version: 1,
    results,
    updatedAt: new Date().toISOString(),
  };

  window.localStorage.setItem(
    LUCKY_DRAW_CONFIG_STORAGE_KEY,
    JSON.stringify(configPayload),
  );
  window.localStorage.setItem(
    LUCKY_DRAW_RESULTS_STORAGE_KEY,
    JSON.stringify(resultsPayload),
  );
  window.localStorage.removeItem(LUCKY_DRAW_LEGACY_STORAGE_KEY);
}

function saveLuckyDrawConfigOnly(config: LuckyDrawConfig): void {
  if (typeof window === "undefined") {
    return;
  }

  const configPayload = {
    version: 1,
    config,
    updatedAt: new Date().toISOString(),
  };

  window.localStorage.setItem(
    LUCKY_DRAW_CONFIG_STORAGE_KEY,
    JSON.stringify(configPayload),
  );
  window.localStorage.removeItem(LUCKY_DRAW_RESULTS_STORAGE_KEY);
  window.localStorage.removeItem(LUCKY_DRAW_LEGACY_STORAGE_KEY);
}

function persistState(
  config: LuckyDrawConfig,
  results: LuckyDrawDrawResult[],
): void {
  try {
    saveLuckyDrawState(config, results);
  } catch {
    throw new Error(
      "Unable to save Lucky Draw data to this browser. Please check local storage permissions or available space.",
    );
  }
}

export const useLuckyDrawStore = create<LuckyDrawStore>()(
  devtools((set, get) => ({
    ...defaultState,
    hydrate: () => {
      if (get().hydrated) {
        return;
      }

      const stored = loadStoredLuckyDrawState();
      const selectedPrizeId =
        stored.config.prizes[0]?.id ?? defaultConfig.prizes[0]?.id ?? null;

      set({
        hydrated: true,
        config: stored.config,
        results: stored.results,
        selectedPrizeId,
        status: "idle",
        errorMessage: stored.errorMessage,
      });
    },
    saveConfig: (config) => {
      const errors = validateDrawConfigInput(config);

      if (errors.length > 0) {
        throw new Error(errors[0]);
      }

      const normalizedExcept = normalizeExceptValues(
        config.ticketRange.except,
        config.ticketRange.from,
        config.ticketRange.to,
      );

      const normalizedConfig: LuckyDrawConfig = {
        ...config,
        ticketRange: {
          ...config.ticketRange,
          except: normalizedExcept,
        },
        prizes: [...config.prizes].map((prize, index) => ({
          id: prize.id.trim() || `prize-${index + 1}`,
          name: prize.name.trim(),
          winners_count: prize.winners_count,
          order: index + 1,
        })),
      };

      const preservedResults = normalizeStoredResults(
        get().results,
        normalizedConfig,
      );
      const selectedPrizeId = normalizedConfig.prizes.some(
        (prize) => prize.id === get().selectedPrizeId,
      )
        ? get().selectedPrizeId
        : (normalizedConfig.prizes[0]?.id ?? null);

      set({
        config: normalizedConfig,
        results: preservedResults,
        selectedPrizeId,
        errorMessage: null,
      });

      persistState(normalizedConfig, preservedResults);
    },
    setSelectedPrizeId: (prizeId) => {
      const prizeExists = get().config.prizes.some(
        (prize) => prize.id === prizeId,
      );
      set({
        selectedPrizeId: prizeExists
          ? prizeId
          : (get().config.prizes[0]?.id ?? null),
        errorMessage: null,
      });
    },
    executeDraw: async (prizeId) => {
      const config = get().config;
      const prize = config.prizes.find((item) => item.id === prizeId);

      if (!prize) {
        set({ status: "error", errorMessage: "Selected prize not found." });
        throw new Error("Selected prize not found.");
      }

      if (get().results.some((result) => result.prizeId === prizeId)) {
        set({
          status: "error",
          errorMessage: "This prize has already been drawn.",
        });
        throw new Error("This prize has already been drawn.");
      }

      set({ status: "drawing", errorMessage: null });

      const displayDigits = getDisplayDigits(config.ticketRange.to);
      const previousWinners = collectPreviousWinners(get().results);
      const availableTickets = getCandidateTickets(
        config.ticketRange.from,
        config.ticketRange.to,
        displayDigits,
        new Set(config.ticketRange.except),
        new Set(previousWinners),
      );

      if (availableTickets.length < prize.winners_count) {
        const message = `Not enough available tickets to draw ${prize.winners_count} winners. Only ${availableTickets.length} tickets are available.`;
        set({ status: "error", errorMessage: message });
        throw new Error(message);
      }

      const winners = pickWinners(availableTickets, prize.winners_count);
      const result: LuckyDrawDrawResult = {
        id:
          typeof crypto !== "undefined" &&
          typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${prize.id}`,
        configId: config.id,
        prizeId: prize.id,
        prizeName: prize.name,
        winners,
        drawSettingsSnapshot: {
          from: config.ticketRange.from,
          to: config.ticketRange.to,
          displayDigits,
          except: config.ticketRange.except,
          winners_count: prize.winners_count,
        },
        createdAt: new Date().toISOString(),
      };

      const nextResults = [result, ...get().results];

      set({
        results: nextResults,
        status: "completed",
        errorMessage: null,
      });

      persistState(config, nextResults);

      return result;
    },
    clearPrizeResult: (prizeId) => {
      const nextResults = get().results.filter(
        (result) => result.prizeId !== prizeId,
      );

      set({
        results: nextResults,
        status: "idle",
        errorMessage: null,
      });

      persistState(get().config, nextResults);
    },
    clearAllResults: () => {
      set({
        results: [],
        status: "idle",
        errorMessage: null,
      });

      try {
        saveLuckyDrawConfigOnly(get().config);
      } catch {
        throw new Error(
          "Unable to save Lucky Draw data to this browser. Please check local storage permissions or available space.",
        );
      }
    },
    clearError: () => {
      set({ errorMessage: null });
    },
  })),
);
