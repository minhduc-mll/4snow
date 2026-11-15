"use client";

import * as React from "react";
import { useChangeLanguage, useT } from "next-i18next/client";
import { storedLanguage } from "@/lib/stored-language";

export type AppLanguage = "vi" | "en";

const LANGUAGE_STORAGE_KEY = "app:language:v1";

function normalizeLanguage(value: string | undefined): AppLanguage | null {
  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase();
  if (normalized === "en" || normalized.startsWith("en-")) {
    return "en";
  }
  if (normalized === "vi" || normalized.startsWith("vi-")) {
    return "vi";
  }
  return null;
}

export function useAppI18n() {
  const { t, i18n } = useT("common");
  const changeLanguage = useChangeLanguage();
  const [fallbackLanguage, setFallbackLanguage] = React.useState<AppLanguage>(() => {
    if (typeof window === "undefined") {
      return normalizeLanguage(i18n.resolvedLanguage ?? i18n.language) ?? "vi";
    }

    return storedLanguage();
  });

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const preferredLanguage = storedLanguage();
    const currentI18nLanguage =
      normalizeLanguage(i18n.resolvedLanguage ?? i18n.language);

    if (currentI18nLanguage !== null && currentI18nLanguage !== preferredLanguage) {
      // Restoring a browser preference needs no server refresh, especially offline.
      void i18n.changeLanguage(preferredLanguage);
    }
  }, [i18n, i18n.language, i18n.resolvedLanguage]);

  const language =
    normalizeLanguage(i18n.resolvedLanguage ?? i18n.language) ?? fallbackLanguage;
  const isReady =
    language !== null &&
    (typeof i18n.hasLoadedNamespace === "function"
      ? i18n.hasLoadedNamespace("common")
      : true);

  const setLanguage = React.useCallback(
    async (nextLanguage: AppLanguage): Promise<void> => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
      }
      setFallbackLanguage(nextLanguage);
      if (typeof navigator !== "undefined" && !navigator.onLine) await i18n.changeLanguage(nextLanguage);
      else await changeLanguage(nextLanguage);
    },
    [changeLanguage, i18n],
  );

  return { t, language, setLanguage, isReady };
}
