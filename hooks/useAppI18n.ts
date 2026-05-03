"use client";

import * as React from "react";
import { useChangeLanguage, useT } from "next-i18next/client";

export type AppLanguage = "vi" | "en";

const LANGUAGE_STORAGE_KEY = "app:language:v1";

export function useAppI18n() {
  const { t, i18n } = useT("common");
  const changeLanguage = useChangeLanguage();

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const savedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    const nextLanguage: AppLanguage = savedLanguage === "en" ? "en" : "vi";

    if (i18n.resolvedLanguage !== nextLanguage) {
      void changeLanguage(nextLanguage);
    }
  }, [changeLanguage, i18n.resolvedLanguage]);

  const language: AppLanguage =
    i18n.resolvedLanguage === "en" ? "en" : "vi";

  const setLanguage = React.useCallback(
    async (nextLanguage: AppLanguage): Promise<void> => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
      }
      await changeLanguage(nextLanguage);
    },
    [changeLanguage],
  );

  return { t, language, setLanguage };
}

