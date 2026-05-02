import Link from "next/link";
import { Gamepad, ShieldCheck, Sparkles, Trophy } from "lucide-react";

import { Button } from "@/components/atoms/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/Card";
import { PATH } from "@/lib/paths";

const routeItems = [
  {
    href: PATH.admin,
    title: "Admin Control",
    description: "Manage Lucky Draw and Quiz event controls.",
    icon: ShieldCheck,
  },
  {
    href: PATH.luckyDraw,
    title: "Lucky Draw Overlay",
    description: "Open the live lucky draw overlay used for event screens.",
    icon: Sparkles,
  },
  {
    href: PATH.quiz,
    title: "Quiz Player",
    description: "Join the live quiz as a participant and answer questions.",
    icon: Gamepad,
  },
  {
    href: PATH.leaderboard,
    title: "Quiz Leaderboard",
    description: "View the real-time quiz leaderboard overlay.",
    icon: Trophy,
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-app-subtle px-4 py-8 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-5xl gap-8">
        <header className="grid gap-3">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              Hello World
            </h1>
          </div>
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
                      Open page
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
