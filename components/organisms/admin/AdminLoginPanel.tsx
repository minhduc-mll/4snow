"use client";

import Link from "next/link";
import { Home } from "lucide-react";
import * as React from "react";

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
import { useAppI18n } from "@/hooks/useAppI18n";
import { PATH } from "@/lib/paths";

interface AdminLoginPanelProps {
  username: string;
  password: string;
  isSubmitting: boolean;
  errorMessage: string | null;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

export function AdminLoginPanel({
  username,
  password,
  isSubmitting,
  errorMessage,
  onUsernameChange,
  onPasswordChange,
  onSubmit,
}: AdminLoginPanelProps): React.ReactElement {
  const { t } = useAppI18n();

  return (
    <main className="min-h-screen bg-app-subtle px-4 py-8 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-lg gap-4">
        <div className="flex min-h-[70vh] flex-col items-end justify-center gap-4">
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
              <form className="grid gap-4" onSubmit={onSubmit}>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-foreground">{t("adminAuth.username")}</span>
                  <Input
                    value={username}
                    onChange={(event) => onUsernameChange(event.target.value)}
                    autoComplete="username"
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-foreground">{t("adminAuth.password")}</span>
                  <Input
                    type="password"
                    value={password}
                    onChange={(event) => onPasswordChange(event.target.value)}
                    autoComplete="current-password"
                  />
                </label>
                {errorMessage ? <Badge variant="danger">{errorMessage}</Badge> : null}
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

