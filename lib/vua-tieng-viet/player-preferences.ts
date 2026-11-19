import type { RoundSettings } from "../../types/vua-tieng-viet.ts";
import { isRecord } from "./publication-contract.ts";

export const PLAYER_PREFERENCES_KEY = "vtv:preferences:v1";
export const DEFAULT_PLAYER_SETTINGS: RoundSettings = { level: 3, guessMode: "dictionary", accuracy: "optional" };

type PlayerPreferences = { schemaVersion: 2; preferredLevel: RoundSettings["level"]; guessMode: RoundSettings["guessMode"]; accuracy: RoundSettings["accuracy"] };

export function readPlayerPreferences(storage: Pick<Storage, "getItem">): RoundSettings {
  try {
    const text = storage.getItem(PLAYER_PREFERENCES_KEY);
    if (!text || text.length > 150) return DEFAULT_PLAYER_SETTINGS;
    const value: unknown = JSON.parse(text);
    if (!isRecord(value) || !((value.schemaVersion === 1 && Object.keys(value).length === 3) || (value.schemaVersion === 2 && Object.keys(value).length === 4))) return DEFAULT_PLAYER_SETTINGS;
    const { preferredLevel, guessMode } = value;
    if (preferredLevel !== 3 && preferredLevel !== 5 && preferredLevel !== 7 && preferredLevel !== 9) return DEFAULT_PLAYER_SETTINGS;
    if (guessMode !== "dictionary" && guessMode !== "free") return DEFAULT_PLAYER_SETTINGS;
    const accuracy = value.schemaVersion === 1 ? DEFAULT_PLAYER_SETTINGS.accuracy : value.accuracy;
    if (accuracy !== "strict" && accuracy !== "optional") return DEFAULT_PLAYER_SETTINGS;
    return { level: preferredLevel, guessMode, accuracy };
  } catch {
    return DEFAULT_PLAYER_SETTINGS;
  }
}

export function writePlayerPreferences(storage: Pick<Storage, "setItem">, settings: RoundSettings): boolean {
  const value: PlayerPreferences = { schemaVersion: 2, preferredLevel: settings.level, guessMode: settings.guessMode, accuracy: settings.accuracy };
  try {
    storage.setItem(PLAYER_PREFERENCES_KEY,JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
