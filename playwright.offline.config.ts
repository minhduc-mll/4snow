import { defineConfig } from "@playwright/test";

// Run after a production build with the same synthetic public settings as playwright.config.ts.
export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "word-persistence.spec.ts",
  grep: /prepared player shell/,
  use: { baseURL: "http://127.0.0.1:3212", browserName: "chromium" },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3212",
    url: "http://127.0.0.1:3212/vua-tieng-viet",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
