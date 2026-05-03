"use client";

import Link from "next/link";
import { Gamepad, ShieldCheck, Sparkles, Trophy } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/atoms/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/atoms/Card";
import { useAppI18n } from "@/hooks/useAppI18n";
import { PATH } from "@/lib/paths";

export default function Home(): React.ReactElement {
  const { t } = useAppI18n();

  const routeItems = [
    {
      href: PATH.admin,
      title: t("home.adminControlTitle"),
      description: t("home.adminControlDescription"),
      icon: ShieldCheck,
    },
    {
      href: PATH.luckyDraw,
      title: t("home.luckyDrawTitle"),
      description: t("home.luckyDrawDescription"),
      icon: Sparkles,
    },
    {
      href: PATH.quiz,
      title: t("home.quizPlayerTitle"),
      description: t("home.quizPlayerDescription"),
      icon: Gamepad,
    },
    {
      href: PATH.leaderboard,
      title: t("home.leaderboardTitle"),
      description: t("home.leaderboardDescription"),
      icon: Trophy,
    },
  ];

  return (
    <main className="min-h-screen bg-app-subtle px-4 py-8 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-5xl gap-8">
        <header className="grid gap-3">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {t("home.title")}
          </h1>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          {routeItems.map((route) => {
            const Icon = route.icon;
            return (
              <Card key={route.href} className="overflow-hidden shadow-soft">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-muted text-foreground">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <CardTitle>{route.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <CardDescription>{route.description}</CardDescription>
                  <Link href={route.href} className="w-full">
                    <Button variant="secondary" size="lg" className="w-full justify-center">
                      {t("home.openPage")}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </main>
  );
}
