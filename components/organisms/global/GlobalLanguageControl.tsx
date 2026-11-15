"use client";

import { usePathname } from "next/navigation";
import { LanguageControl } from "@/components/molecules/LanguageControl";
import { PATH } from "@/lib/paths";

export function GlobalLanguageControl() {
  const pathname = usePathname();
  return pathname === PATH.vuaTiengViet ? null : <LanguageControl />;
}
