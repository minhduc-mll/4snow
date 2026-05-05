"use client";

import * as React from "react";
import { useChangeLanguage, useT } from "next-i18next/client";

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

    const savedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return savedLanguage === "en" ? "en" : "vi";
  });

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const savedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    const preferredLanguage: AppLanguage = savedLanguage === "en" ? "en" : "vi";
    const currentI18nLanguage =
      normalizeLanguage(i18n.resolvedLanguage ?? i18n.language);

    if (currentI18nLanguage !== preferredLanguage) {
      void changeLanguage(preferredLanguage);
    }
  }, [changeLanguage, i18n.language, i18n.resolvedLanguage]);

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
      await changeLanguage(nextLanguage);
    },
    [changeLanguage],
  );

  return { t, language, setLanguage, isReady };
}
