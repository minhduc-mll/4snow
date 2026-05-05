"use client";

import * as React from "react";
import Link from "next/link";
import { Home, LogOut } from "lucide-react";

import { Badge } from "@/components/atoms/Badge";
import { Button } from "@/components/atoms/Button";
import { AdminLoginPanel } from "@/components/organisms/admin/AdminLoginPanel";
import { LuckyDrawAdminPanel } from "@/components/organisms/lucky-draw/LuckyDrawAdminPanel";
import { QuizImportPanel } from "@/components/organisms/quiz/QuizImportPanel";
import { ADMIN_AUTH_TOKEN_KEY, clearAdminAuthToken, setAdminAuthToken } from "@/hooks/useAdminAuth";
import { useAppI18n } from "@/hooks/useAppI18n";
import { PATH } from "@/lib/paths";
import type {
  AdminLoginErrorResponse,
  AdminLoginSuccessResponse,
  AdminVerifyResponse,
} from "@/types/admin-auth";

type AdminAuthState =
  | { status: "checking" }
  | { status: "unauthenticated" }
  | { status: "authenticated"; expiresAt: number }
  | { status: "error"; message: string };

export default function AdminPage(): React.ReactElement {
  const { t } = useAppI18n();
  const [initialToken] = React.useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    return window.localStorage.getItem(ADMIN_AUTH_TOKEN_KEY);
  });
  const [authState, setAuthState] = React.useState<AdminAuthState>(() => {
    if (initialToken) {
      return { status: "checking" };
    }
    return { status: "unauthenticated" };
  });
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const verifyToken = React.useCallback(async (token: string): Promise<void> => {
    try {
      const response = await fetch("/api/admin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await response.json()) as AdminVerifyResponse;

      if (data.valid) {
        setAuthState({
          status: "authenticated",
          expiresAt: data.expiresAt ?? Date.now(),
        });
        return;
      }
    } catch {
      // no-op
    }

    clearAdminAuthToken();
    setAuthState({ status: "unauthenticated" });
  }, []);

  React.useEffect(() => {
    if (!initialToken) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void verifyToken(initialToken);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [initialToken, verifyToken]);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await response.json()) as
        | AdminLoginSuccessResponse
        | AdminLoginErrorResponse;

      if (!response.ok || !("token" in data)) {
        setAuthState({
          status: "error",
          message:
            "message" in data
              ? data.message
              : t("adminAuth.loginFailed"),
        });
        clearAdminAuthToken();
        return;
      }

      setAdminAuthToken(data.token);
      setPassword("");
      setAuthState({ status: "authenticated", expiresAt: data.expiresAt });
    } catch {
      setAuthState({ status: "error", message: t("adminAuth.loginFailed") });
      clearAdminAuthToken();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = (): void => {
    clearAdminAuthToken();
    setAuthState({ status: "unauthenticated" });
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
      </div>
    </main>
  );
}
