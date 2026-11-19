"use client";

import * as React from "react";
import Link from "next/link";
import { Home, LogOut } from "lucide-react";

import { Badge } from "@/components/atoms/Badge";
import { Button } from "@/components/atoms/Button";
import { AdminLoginPanel } from "@/components/organisms/admin/AdminLoginPanel";
import { LuckyDrawAdminPanel } from "@/components/organisms/lucky-draw/LuckyDrawAdminPanel";
import { QuizImportPanel } from "@/components/organisms/quiz/QuizImportPanel";
import { DictionaryPreviewPanel } from "@/components/organisms/vua-tieng-viet/DictionaryPreviewPanel";
import { CandidateEditorialPanel } from "@/components/organisms/vua-tieng-viet/CandidateEditorialPanel";
import { DictionaryPublicationPanel } from "@/components/organisms/vua-tieng-viet/DictionaryPublicationPanel";
import { useAdminSession } from "@/hooks/useAdminAuth";
import { useAppI18n } from "@/hooks/useAppI18n";
import { PATH } from "@/lib/paths";
export default function AdminPage(): React.ReactElement {
  const { t } = useAppI18n();
  const { state: authState, login, logout: handleLogout, expire: handleExpiry } = useAdminSession();
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    if (await login(username, password, t("adminAuth.loginFailed"))) setPassword("");
    setIsSubmitting(false);
  };

  if (authState.status === "checking") {
    return (
      <main className="min-h-screen bg-app-subtle px-4 py-8 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto grid w-full max-w-5xl place-items-center gap-6">
          <Badge variant="outline">{t("adminAuth.checking")}</Badge>
        </div>
      </main>
    );
  }

  if (authState.status !== "authenticated") {
    const errorMessage = authState.status === "error" ? authState.message : null;

    return (
      <AdminLoginPanel
        username={username}
        password={password}
        isSubmitting={isSubmitting}
        errorMessage={errorMessage}
        onUsernameChange={setUsername}
        onPasswordChange={setPassword}
        onSubmit={handleLogin}
      />
    );
  }

  return (
    <main className="min-h-screen bg-app-subtle px-4 py-8 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-5xl gap-6">
        <header className="flex items-end justify-between gap-3">
          <div className="grid gap-2">
            <p className="text-sm font-medium text-muted-foreground">{t("adminPage.section")}</p>
            <h1 className="text-3xl font-semibold tracking-normal text-foreground">
              {t("adminPage.title")}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href={PATH.home}>
              <Button
                variant="outline"
                leftIcon={<Home className="size-4" aria-hidden />}
              >
                {t("adminAuth.homeAction")}
              </Button>
            </Link>
            <Button
              variant="outline"
              leftIcon={<LogOut className="size-4" aria-hidden />}
              onClick={handleLogout}
            >
              {t("adminAuth.logoutAction")}
            </Button>
          </div>
        </header>

        <LuckyDrawAdminPanel />
        <QuizImportPanel />
        <DictionaryPreviewPanel onUnauthorized={handleExpiry} />
        <CandidateEditorialPanel onUnauthorized={handleExpiry} />
        <DictionaryPublicationPanel onUnauthorized={handleExpiry} />
      </div>
    </main>
  );
}
