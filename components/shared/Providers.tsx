"use client";

import * as React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

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

  return (
    <SupabaseContext.Provider value={supabase}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SupabaseContext.Provider>
  );
}
