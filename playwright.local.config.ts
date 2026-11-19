import { defineConfig } from "@playwright/test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

// Opt-in local verification. Secrets remain in the test runner/server process.
const runtime = Object.fromEntries(readFileSync(process.env.VTV_LOCAL_RUNTIME_ENV ?? "supabase/.temp/start-secrets/supabase_edge_runtime_4snow/env/docker.env", "utf8").split(/\r?\n/).filter((line) => line.includes("=")).map((line) => { const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1)]; }));
const origin = new URL(runtime.VTV_ALLOWED_ORIGINS.split(",")[0].trim());
if (origin.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(origin.hostname)) throw new Error("Local verification requires a loopback HTTP origin");
if (!runtime.ADMIN_JWT_SECRET || !runtime.SUPABASE_ANON_KEY) throw new Error("Local runtime credentials missing");
process.env.VTV_LOCAL_TEST_PASSWORD ??= randomUUID();
process.env.VTV_LOCAL_SUPABASE_URL ??= "http://127.0.0.1:54321";
const gateway = new URL(process.env.VTV_LOCAL_SUPABASE_URL);
if (gateway.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(gateway.hostname)) throw new Error("Local verification requires a loopback Supabase gateway");

export default defineConfig({
  testDir: "./tests/local-browser",
  workers: 1,
  timeout: 30000,
  use: { baseURL: origin.origin, browserName: "chromium" },
  webServer: {
    command: `npm run dev -- --hostname ${origin.hostname} --port ${origin.port || "80"}`,
    url: `${origin.origin}/admin`,
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: gateway.origin,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: runtime.SUPABASE_ANON_KEY,
      NEXT_PUBLIC_VTV_IMPORT_ENABLED: "true",
      ADMIN_USERNAME: "local-verification-admin",
      ADMIN_PASSWORD: process.env.VTV_LOCAL_TEST_PASSWORD,
      ADMIN_JWT_SECRET: runtime.ADMIN_JWT_SECRET,
    },
  },
});
