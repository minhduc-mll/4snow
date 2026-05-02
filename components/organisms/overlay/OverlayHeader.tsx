"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/atoms/Button";
import { PATH } from "@/lib/paths";

const overlayTitles: Record<string, string> = {
  [PATH.luckyDraw]: "Lucky Draw",
  [PATH.leaderboard]: "Leaderboard",
};

export function OverlayHeader(): React.ReactElement {
  const pathname = usePathname();
  const title = overlayTitles[pathname] ?? "Overlay";

  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="grid gap-2">
        <p className="text-sm font-medium text-muted-foreground">Snow</p>
        <h1 className="text-3xl font-semibold tracking-normal text-foreground">
          {title}
        </h1>
      </div>
      <Link href={PATH.home}>
        <Button
          variant="outline"
          leftIcon={<ArrowLeft className="size-4" aria-hidden />}
        >
          Back to home
        </Button>
      </Link>
    </header>
  );
}
