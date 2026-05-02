export type UUID = string;
export type IsoDateTime = string;

export type LuckyDrawStatus =
  | "idle"
  | "drawing"
  | "animating"
  | "completed"
  | "error";

export interface LuckyDrawPrize {
  id: string;
  name: string;
  winners_count: number;
  order: number;
}

export interface TicketRangeConfig {
  from: number;
  to: number;
  except: string[];
}

export interface LuckyDrawConfig {
  id: string;
  name: string;
  ticketRange: TicketRangeConfig;
  prizes: LuckyDrawPrize[];
}

export interface LuckyDrawDrawSettingsSnapshot {
  from: number;
  to: number;
  displayDigits: number;
  except: string[];
  winners_count: number;
}

export type LuckyDrawSettingsSnapshot = LuckyDrawDrawSettingsSnapshot;
export type LuckyDrawTicketConfig = TicketRangeConfig;
export type PrizeCategory = string;

export interface LuckyDrawDrawResult {
  id: UUID;
  configId: string;
  prizeId: string;
  prizeName: string;
  winners: string[];
  drawSettingsSnapshot: LuckyDrawDrawSettingsSnapshot;
  createdAt: IsoDateTime;
}

export interface LuckyDrawStorageState {
  version: 1;
  config: LuckyDrawConfig;
  results: LuckyDrawDrawResult[];
  updatedAt: string;
}

export function isLuckyDrawPrize(value: unknown): value is LuckyDrawPrize {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    Number.isInteger(record.winners_count) &&
    Number.isInteger(record.order)
  );
}

export function isLuckyDrawTicketRangeConfig(
  value: unknown,
): value is TicketRangeConfig {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    Number.isInteger(record.from) &&
    Number.isInteger(record.to) &&
    Array.isArray(record.except) &&
    record.except.every((item) => typeof item === "string")
  );
}

export function isLuckyDrawConfig(value: unknown): value is LuckyDrawConfig {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    isLuckyDrawTicketRangeConfig(record.ticketRange) &&
    Array.isArray(record.prizes) &&
    record.prizes.every(isLuckyDrawPrize)
  );
}

export function isLuckyDrawDrawResult(
  value: unknown,
): value is LuckyDrawDrawResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.id === "string" &&
    typeof record.configId === "string" &&
    typeof record.prizeId === "string" &&
    typeof record.prizeName === "string" &&
    Array.isArray(record.winners) &&
    record.winners.every((item) => typeof item === "string") &&
    typeof record.drawSettingsSnapshot === "object" &&
    record.drawSettingsSnapshot !== null &&
    typeof record.createdAt === "string"
  );
}
