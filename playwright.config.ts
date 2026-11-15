import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  use: { baseURL: "http://127.0.0.1:3211", browserName: "chromium" },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3211",
    url: "http://127.0.0.1:3211/admin",
    reuseExistingServer: false,
    timeout: 120000,
    env: { NEXT_PUBLIC_SUPABASE_URL: "https://test-supabase.invalid", NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key", NEXT_PUBLIC_VTV_IMPORT_ENABLED: "true" },
  },
});
