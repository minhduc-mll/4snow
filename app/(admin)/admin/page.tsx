"use client";

import * as React from "react";
import Link from "next/link";
import { Home, LogOut } from "lucide-react";
import { Badge } from "@/components/atoms/Badge";
import { Button } from "@/components/atoms/Button";
import { AdminLoginPanel } from "@/components/organisms/admin/AdminLoginPanel";
import { LuckyDrawAdminPanel } from "@/components/organisms/lucky-draw/LuckyDrawAdminPanel";
import { QuizImportPanel } from "@/components/organisms/quiz/QuizImportPanel";
import { DictionaryWorkflow } from "@/components/organisms/vua-tieng-viet/DictionaryWorkflow";
import { useAdminSession } from "@/hooks/useAdminAuth";
import { useAppI18n } from "@/hooks/useAppI18n";
import { PATH } from "@/lib/paths";

type Section = "overview" | "lucky-draw" | "quiz" | "dictionary";
const sections: Section[] = ["overview", "lucky-draw", "quiz", "dictionary"];
function readSection(): Section {
  const section = window.location.hash.slice(1).split("/")[0];
  return sections.find((item) => item === section) ?? "overview";
}
function subscribeSection(callback: () => void): () => void {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}
function serverSection(): Section { return "overview"; }

function KeepSection({ active, children }: { active: boolean; children: React.ReactNode }): React.ReactElement | null {
  const [visited, setVisited] = React.useState(active);
  if (active && !visited) setVisited(true);
  return visited || active ? <div hidden={!active}>{children}</div> : null;
}

export default function AdminPage(): React.ReactElement {
  const { t } = useAppI18n();
  const { state: authState, login, logout: handleLogout } = useAdminSession();
  const section = React.useSyncExternalStore(subscribeSection, readSection, serverSection);
  const scrollPositions = React.useRef<Partial<Record<Section, number>>>({});
  React.useLayoutEffect(() => {
    const positions = scrollPositions.current;
    window.scrollTo(0, positions[section] ?? 0);
    const recordPosition = () => { positions[section] = window.scrollY; };
    window.addEventListener("scroll", recordPosition, { passive: true });
    return () => window.removeEventListener("scroll", recordPosition);
  }, [section]);
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    if (await login(username, password, t("adminAuth.loginFailed"))) setPassword("");
    setIsSubmitting(false);
  };
  if (authState.status === "checking") return <main className="min-h-screen bg-app-subtle px-4 py-8"><Badge variant="outline">{t("adminAuth.checking")}</Badge></main>;
  if (authState.status !== "authenticated") return <AdminLoginPanel username={username} password={password} isSubmitting={isSubmitting} errorMessage={authState.status === "error" ? authState.message : null} onUsernameChange={setUsername} onPasswordChange={setPassword} onSubmit={handleLogin} />;

  const navigation = (className: string) => (
    <nav aria-label={t("adminNav.label")} className={className}>
      {sections.map((item) => <a key={item} href={`#${item}`} aria-current={item === section ? "page" : undefined} className={`flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${item === section ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"}`}>
        {t(`adminNav.${item}`)}{item === section && <span className="ml-auto pl-2 text-xs">{t("adminNav.current")}</span>}
      </a>)}
    </nav>
  );
  return <main className="min-h-screen bg-app-subtle px-4 py-6 text-ink sm:px-6 lg:px-8">
    <div className="mx-auto grid w-full max-w-7xl gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-sm font-medium text-muted-foreground">{t("adminPage.section")}</p><h1 className="text-3xl font-semibold text-foreground">{t("adminPage.title")}</h1></div>
        <div className="flex flex-wrap gap-2"><Link href={PATH.home} className="inline-flex min-h-10 items-center gap-2 rounded-md border bg-background px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><Home className="size-4" aria-hidden />{t("adminAuth.homeAction")}</Link><Button data-admin-logout variant="outline" leftIcon={<LogOut className="size-4" aria-hidden />} onClick={handleLogout}>{t("adminAuth.logoutAction")}</Button></div>
      </header>
      <div className="grid min-w-0 gap-5 md:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="hidden md:block">{navigation("grid gap-1 rounded-lg border bg-card p-2")}</aside>
        <details className="rounded-lg border bg-card p-3 md:hidden"><summary className="min-h-11 cursor-pointer py-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{t("adminNav.menu")}: {t(`adminNav.${section}`)}</summary>{navigation("grid gap-1 pt-2")}</details>
        <div className="grid min-w-0 content-start gap-6">
          {section === "overview" && <section aria-labelledby="overview-heading" className="grid gap-4"><div><h2 id="overview-heading" className="text-2xl font-semibold">{t("adminNav.overview")}</h2><p className="text-muted-foreground">{t("adminNav.intro")}</p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{sections.filter((item) => item !== "overview").map((item) => <a key={item} href={`#${item}`} className="rounded-lg border bg-card p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary hover:bg-muted"><h3 className="font-semibold">{t(`adminNav.${item}`)}</h3><p className="mt-2 text-sm text-muted-foreground">{t(`adminNav.${item}Description`)}</p></a>)}</div></section>}
          <KeepSection active={section === "lucky-draw"}><LuckyDrawAdminPanel /></KeepSection>
          <KeepSection active={section === "quiz"}><QuizImportPanel /></KeepSection>
          <KeepSection active={section === "dictionary"}><DictionaryWorkflow onUnauthorized={handleLogout} /></KeepSection>
        </div>
      </div>
    </div>
  </main>;
}
