import type { RoundSettings } from "../../types/vua-tieng-viet.ts";
import { isRecord } from "./publication-contract.ts";

export const PLAYER_PREFERENCES_KEY = "vtv:preferences:v1";
export const DEFAULT_PLAYER_SETTINGS: RoundSettings = { level: 3, guessMode: "dictionary" };

type PlayerPreferences = { schemaVersion: 1; preferredLevel: RoundSettings["level"]; guessMode: RoundSettings["guessMode"] };

export function readPlayerPreferences(storage: Pick<Storage, "getItem">): RoundSettings {
  try {
    const text = storage.getItem(PLAYER_PREFERENCES_KEY);
    if (!text || text.length > 150) return DEFAULT_PLAYER_SETTINGS;
    const value: unknown = JSON.parse(text);
    if (!isRecord(value) || Object.keys(value).length !== 3 || value.schemaVersion !== 1) return DEFAULT_PLAYER_SETTINGS;
    const { preferredLevel, guessMode } = value;
    if (preferredLevel !== 3 && preferredLevel !== 5 && preferredLevel !== 7 && preferredLevel !== 9) return DEFAULT_PLAYER_SETTINGS;
    if (guessMode !== "dictionary" && guessMode !== "free") return DEFAULT_PLAYER_SETTINGS;
    return { level: preferredLevel, guessMode };
  } catch {
    return DEFAULT_PLAYER_SETTINGS;
  }
}

export function writePlayerPreferences(storage: Pick<Storage, "setItem">, settings: RoundSettings): boolean {
  const value: PlayerPreferences = { schemaVersion: 1, preferredLevel: settings.level, guessMode: settings.guessMode };
  try {
    storage.setItem(PLAYER_PREFERENCES_KEY,JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
