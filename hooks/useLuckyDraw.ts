import type { LuckyDrawConfig, LuckyDrawDrawResult } from "@/types/lucky-draw";

export const luckyDrawDecelerationEase: [number, number, number, number] = [
  0.12, 0, 0.39, 0,
];

export const luckyDrawSpinDurationMs = 2_800;
export const largeWinnerAnimationThreshold = 20;
export const LUCKY_DRAW_CONFIG_STORAGE_KEY = "lucky-draw:config:v1";
export const LUCKY_DRAW_RESULTS_STORAGE_KEY = "lucky-draw:results:v1";
export const LUCKY_DRAW_LEGACY_STORAGE_KEY = "lucky-draw:v1";

export function getDisplayDigits(to: number): number {
  return String(Math.trunc(to)).length;
}

export function formatTicket(value: number, displayDigits: number): string {
  return String(value).padStart(displayDigits, "0");
}

export function parseExceptInput(value: string): string[] {
  return value
    .split(/[\n,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizePrizeId(value: string, fallbackOrder: number): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || `prize-${fallbackOrder}`;
}

export function createDefaultLuckyDrawConfig(): LuckyDrawConfig {
  return {
    id: "default",
    name: "Lucky Draw",
    ticketRange: {
      from: 0,
      to: 999,
      except: [],
    },
    prizes: [
      {
        id: "first_prize",
        name: "First Prize",
        winners_count: 1,
        order: 1,
      },
    ],
  };
}

export function normalizeExceptValues(
  except: string[],
  from: number,
  to: number,
): string[] {
  const displayDigits = getDisplayDigits(to);
  const normalized = new Set<string>();

  for (const raw of except) {
    const ticketText = raw.trim();

    if (ticketText === "") {
      continue;
    }

    if (!/^\d+$/.test(ticketText)) {
      throw new Error(
        `Invalid exclusion list. Ticket ${ticketText} is not numeric.`,
      );
    }

    const ticketValue = Number(ticketText);

    if (
      !Number.isInteger(ticketValue) ||
      ticketValue < from ||
      ticketValue > to
    ) {
      throw new Error(
        `Invalid exclusion list. Ticket ${ticketText} is outside the configured range ${formatTicket(
          from,
          displayDigits,
        )}-${formatTicket(to, displayDigits)}.`,
      );
    }

    normalized.add(formatTicket(ticketValue, displayDigits));
  }

  return Array.from(normalized);
}

export function validateDrawConfigInput(config: LuckyDrawConfig): string[] {
  const errors: string[] = [];
  const { from, to, except } = config.ticketRange;

  if (!config.name.trim()) {
    errors.push("Configuration name is required.");
  }

  if (!Number.isInteger(from) || !Number.isInteger(to)) {
    errors.push("Range values must be whole numbers.");
  }

  if (from < 0 || to < 0) {
    errors.push("Range values cannot be negative.");
  }

  if (from > to) {
    errors.push(
      "Invalid ticket range. The starting number must be less than or equal to the ending number.",
    );
  }

  if (!Array.isArray(except)) {
    errors.push("Invalid exclusion list.");
  }

  const displayDigits = getDisplayDigits(to);

  except.forEach((ticket) => {
    if (!/^\d+$/.test(ticket)) {
      errors.push(`Invalid exclusion list. Ticket ${ticket} is not numeric.`);
      return;
    }

    const numericTicket = Number(ticket);

    if (
      !Number.isInteger(numericTicket) ||
      numericTicket < from ||
      numericTicket > to
    ) {
      errors.push(
        `Invalid exclusion list. Ticket ${ticket} is outside the configured range ${formatTicket(
          from,
          displayDigits,
        )}-${formatTicket(to, displayDigits)}.`,
      );
    }
  });

  if (!Array.isArray(config.prizes) || config.prizes.length === 0) {
    errors.push("At least one prize is required.");
  }

  config.prizes.forEach((prize) => {
    if (!prize.id.trim()) {
      errors.push("Every prize needs an ID.");
    }

    if (!prize.name.trim()) {
      errors.push("Every prize needs a name.");
    }

    if (!Number.isInteger(prize.winners_count) || prize.winners_count < 1) {
      errors.push(`${prize.name || prize.id} must have at least 1 winner.`);
    }
  });

  return Array.from(new Set(errors));
}

export function getTicketPool(
  from: number,
  to: number,
  displayDigits: number,
  excluded: Set<string>,
  previousWinners: Set<string>,
): string[] {
  const pool: string[] = [];

  for (let value = from; value <= to; value += 1) {
    const ticket = formatTicket(value, displayDigits);

    if (excluded.has(ticket) || previousWinners.has(ticket)) {
      continue;
    }

    pool.push(ticket);
  }

  return pool;
}

export const getCandidateTickets = getTicketPool;

export function getAvailableTicketCount(
  config: LuckyDrawConfig,
  previousWinners: string[] = [],
): number {
  const displayDigits = getDisplayDigits(config.ticketRange.to);

  return getTicketPool(
    config.ticketRange.from,
    config.ticketRange.to,
    displayDigits,
    new Set(config.ticketRange.except),
    new Set(previousWinners),
  ).length;
}

export function collectPreviousWinners(
  results: LuckyDrawDrawResult[],
): string[] {
  return Array.from(
    results.reduce<Set<string>>((set, result) => {
      result.winners.forEach((winner) => set.add(winner));
      return set;
    }, new Set()),
  );
}

export function secureRandomInt(maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error("maxExclusive must be a positive integer");
  }

  const array = new Uint32Array(1);
  const maxUint32 = 0xffffffff;
  const limit = maxUint32 - (maxUint32 % maxExclusive);
  let value: number;

  do {
    crypto.getRandomValues(array);
    value = array[0];
  } while (value >= limit);

  return value % maxExclusive;
}

export function pickWinners(
  availableTickets: string[],
  count: number,
): string[] {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error("Winner count must be a positive integer.");
  }

  if (availableTickets.length < count) {
    throw new Error("Not enough available tickets.");
  }

  const pool = [...availableTickets];
  const winners: string[] = [];

  for (let i = 0; i < count; i += 1) {
    const index = secureRandomInt(pool.length);
    winners.push(pool[index]);
    pool.splice(index, 1);
  }

  return winners;
}
