import { execFileSync } from "node:child_process";
import { defineConfig } from "@playwright/test";

const cli = process.env.SUPABASE_CLI;
if (!cli) throw new Error("Set SUPABASE_CLI to the local CLI executable");
const status: unknown = JSON.parse(execFileSync(cli, ["status", "--output", "json", "--workdir", "output/quiz-verification"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
if (typeof status !== "object" || status === null || !("API_URL" in status) || status.API_URL !== "http://127.0.0.1:55321" || !("ANON_KEY" in status) || typeof status.ANON_KEY !== "string") throw new Error("Only the disposable quiz-verification stack is allowed");

export default defineConfig({
  testDir: "./tests/quiz-browser", workers: 1, timeout: 60000,
  use: { baseURL: "http://127.0.0.1:3214", browserName: "chromium", locale: "en-US" },
  webServer: { command: "npm run dev -- --hostname 127.0.0.1 --port 3214", url: "http://127.0.0.1:3214", reuseExistingServer: false, timeout: 120000,
    env: { NEXT_PUBLIC_SUPABASE_URL: status.API_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY } },
});
