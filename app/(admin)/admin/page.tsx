"use client";

import * as React from "react";
import Link from "next/link";
import { Home, LogOut } from "lucide-react";

import { Badge } from "@/components/atoms/Badge";
import { Button } from "@/components/atoms/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/atoms/Card";
import { Input } from "@/components/atoms/Input";
import { LuckyDrawAdminPanel } from "@/components/organisms/lucky-draw/LuckyDrawAdminPanel";
import { QuizImportPanel } from "@/components/organisms/quiz/QuizImportPanel";
import { useAppI18n } from "@/hooks/useAppI18n";
import { PATH } from "@/lib/paths";
import type {
  AdminLoginErrorResponse,
  AdminLoginSuccessResponse,
  AdminVerifyResponse,
} from "@/types/admin-auth";

const ADMIN_AUTH_TOKEN_KEY = "admin-auth-token";

type AdminAuthState =
  | { status: "checking" }
  | { status: "unauthenticated" }
  | { status: "authenticated"; expiresAt: number }
  | { status: "error"; message: string };

function clearAdminToken(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(ADMIN_AUTH_TOKEN_KEY);
  }
}

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

    clearAdminToken();
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
        clearAdminToken();
        return;
      }

      window.localStorage.setItem(ADMIN_AUTH_TOKEN_KEY, data.token);
      setPassword("");
      setAuthState({ status: "authenticated", expiresAt: data.expiresAt });
    } catch {
      setAuthState({ status: "error", message: t("adminAuth.loginFailed") });
      clearAdminToken();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = (): void => {
    clearAdminToken();
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
    return (
      <main className="min-h-screen bg-app-subtle px-4 py-8 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto grid w-full max-w-lg gap-4">
          <div className="flex flex-col min-h-[70vh] items-end justify-center gap-4">
          <Link href={PATH.home} className="w-fit">
            <Button
              variant="outline"
              size="icon"
              aria-label={t("adminAuth.homeAction")}
            >
              <Home className="size-4" aria-hidden />
            </Button>
          </Link>

            <Card className="w-full shadow-soft">
              <CardHeader>
                <CardTitle>{t("adminAuth.loginTitle")}</CardTitle>
                <CardDescription>{t("adminAuth.loginDescription")}</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="grid gap-4" onSubmit={handleLogin}>
                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium text-foreground">{t("adminAuth.username")}</span>
                    <Input
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      autoComplete="username"
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium text-foreground">{t("adminAuth.password")}</span>
                    <Input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="current-password"
                    />
                  </label>
                  {authState.status === "error" ? (
                    <Badge variant="danger">{authState.message}</Badge>
                  ) : null}
                  <Button type="submit" isLoading={isSubmitting}>
                    {t("adminAuth.loginAction")}
                  </Button>
                </form>
              </CardContent>
              <CardFooter />
            </Card>
          </div>
        </div>
      </main>
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
