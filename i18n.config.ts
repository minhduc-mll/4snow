import { defineConfig } from "next-i18next";

export default defineConfig({
  supportedLngs: ["vi", "en"],
  fallbackLng: "vi",
  defaultNS: "common",
  ns: ["common"],
  localeInPath: false,
  localePath: "/locales",
  cookieName: "i18next",
});

