"use client";

import * as React from "react";

import { LuckyDrawAdminPanel } from "@/components/organisms/lucky-draw/LuckyDrawAdminPanel";
import { QuizImportPanel } from "@/components/organisms/quiz/QuizImportPanel";
import { useAppI18n } from "@/hooks/useAppI18n";

export default function AdminPage(): React.ReactElement {
  const { t } = useAppI18n();

  return (
    <main className="min-h-screen bg-app-subtle px-4 py-8 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-5xl gap-6">
        <header className="grid gap-2">
          <p className="text-sm font-medium text-muted-foreground">{t("adminPage.section")}</p>
          <h1 className="text-3xl font-semibold tracking-normal text-foreground">
            {t("adminPage.title")}
          </h1>
        </header>

        <LuckyDrawAdminPanel />
        <QuizImportPanel />
      </div>
    </main>
  );
}
