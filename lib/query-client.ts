import { QueryClient, type QueryClientConfig } from "@tanstack/react-query";

const oneSecond = 1_000;
const oneMinute = 60 * oneSecond;

export const realtimeQueryClientConfig = {
  defaultOptions: {
    queries: {
      staleTime: 15 * oneSecond,
      gcTime: 10 * oneMinute,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
      networkMode: "online",
    },
    mutations: {
      retry: 0,
      networkMode: "online",
    },
  },
} satisfies QueryClientConfig;

export function createQueryClient(): QueryClient {
  return new QueryClient(realtimeQueryClientConfig);
}
