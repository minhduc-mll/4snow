"use client";

import * as React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { I18nProvider } from "next-i18next/client";

import { createQueryClient } from "@/lib/query-client";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";

export interface ProvidersProps {
  children: React.ReactNode;
}

const SupabaseContext =
  React.createContext<SupabaseClient<Database>>(supabase);

export function useSupabaseClient(): SupabaseClient<Database> {
  return React.useContext(SupabaseContext);
}

export function Providers({ children }: ProvidersProps): React.ReactElement {
  const [queryClient] = React.useState(() => createQueryClient());
  const [language] = React.useState(() => {
    if (typeof window === "undefined") {
      return "vi";
    }
    const savedLanguage = window.localStorage.getItem("app:language:v1");
    return savedLanguage === "en" ? "en" : "vi";
  });

  return (
    <I18nProvider
      language={language}
      supportedLngs={["vi", "en"]}
      fallbackLng="vi"
      defaultNS="common"
      localePath="/locales"
    >
      <SupabaseContext.Provider value={supabase}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </SupabaseContext.Provider>
    </I18nProvider>
  );
}
