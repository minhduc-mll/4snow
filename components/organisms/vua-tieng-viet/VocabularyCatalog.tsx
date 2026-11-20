"use client";

import Link from "next/link";
import { ArrowLeft, Download, Search } from "lucide-react";
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { useAppI18n } from "@/hooks/useAppI18n";
import { useVocabularyCatalog } from "@/hooks/useVocabularyCatalog";
import { PATH } from "@/lib/paths";
import { HO_NGOC_DUC_SOURCE, KAIKKI_SOURCE, VOCABULARY_URL, wiktionaryEntryUrl } from "@/lib/vua-tieng-viet/public-vocabulary";

const sourceLinkStyle = "rounded-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring";

export function VocabularyCatalog() {
  const { t, language } = useAppI18n();
  const model = useVocabularyCatalog();
  const number = new Intl.NumberFormat(language);

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-8 sm:px-8 sm:py-12">
      <nav className="flex flex-wrap items-center justify-between gap-4" aria-label={t("wordGame.navigation")}>
        <Link href={PATH.vuaTiengViet} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-ring">
          <ArrowLeft size={16} aria-hidden="true" />
          {t("vocabularyCatalog.back")}
        </Link>
      </nav>
      <header className="grid gap-4 border-b pb-6">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">{t("vocabularyCatalog.title")}</h1>
        <p className="max-w-2xl text-muted-foreground">{t("vocabularyCatalog.description")}</p>
        <a href={VOCABULARY_URL} download className="inline-flex min-h-11 w-fit items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
          <Download size={16} aria-hidden="true" />
          {t("vocabularyCatalog.download")}
        </a>
      </header>
      <section className="grid gap-4" aria-label={t("vocabularyCatalog.search")}>
        <div className="grid gap-2">
          <label htmlFor="vocabulary-search" className="text-sm font-medium">{t("vocabularyCatalog.search")}</label>
          <div className="relative max-w-xl">
            <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input id="vocabulary-search" className="h-11 pl-10" type="search" autoComplete="off" value={model.search}
              onChange={(event) => model.changeSearch(event.target.value)} placeholder={t("vocabularyCatalog.placeholder")} />
          </div>
        </div>
        <p role="status" className="text-sm text-muted-foreground">
          {model.isPending ? t("vocabularyCatalog.loading") : model.isError ? t("vocabularyCatalog.error")
            : t("vocabularyCatalog.resultCount", { total: number.format(model.resultCount) })}
        </p>
        {model.isError ? <Button type="button" variant="outline" className="w-fit" onClick={() => void model.refetch()}>{t("vocabularyCatalog.retry")}</Button> : null}
        {model.rows.length ? (
          <>
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full table-fixed text-left text-sm">
                <thead className="bg-muted text-foreground">
                  <tr>
                    <th scope="col" className="w-7/12 px-3 py-3 sm:w-2/3 sm:px-4">{t("vocabularyCatalog.spelling")}</th>
                    <th scope="col" className="px-3 py-3 sm:px-4">{t("vocabularyCatalog.sources")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {model.rows.map((row, index) => (
                    <tr key={model.offset + index}>
                      <td className="break-words px-3 py-2.5 align-top font-medium sm:px-4">{row.spelling}</td>
                      <td className="px-3 py-2.5 align-top sm:px-4">
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {row.wiktionary ? <a className={sourceLinkStyle} href={wiktionaryEntryUrl(row.spelling)}>Wiktionary</a> : null}
                          {row.hoNgocDuc ? <a className={sourceLinkStyle} href={HO_NGOC_DUC_SOURCE}>Hồ Ngọc Đức</a> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {model.pageCount > 1 ? (
              <nav aria-label={t("vocabularyCatalog.pagination")} className="flex flex-wrap items-center justify-between gap-2">
                <Button type="button" variant="outline" disabled={model.pageIndex === 0} onClick={() => model.setPage(model.pageIndex - 1)}>{t("vocabularyCatalog.previous")}</Button>
                <span className="text-sm tabular-nums text-muted-foreground" aria-live="polite">
                  {number.format(model.pageIndex + 1)} / {number.format(model.pageCount)}
                </span>
                <Button type="button" variant="outline" disabled={model.pageIndex + 1 === model.pageCount} onClick={() => model.setPage(model.pageIndex + 1)}>{t("vocabularyCatalog.next")}</Button>
              </nav>
            ) : null}
          </>
        ) : !model.isPending && !model.isError ? <p>{t("vocabularyCatalog.empty")}</p> : null}
      </section>
      <footer className="grid gap-3 border-t pt-6 text-sm">
        <h2 className="font-semibold">{t("vocabularyCatalog.credits")}</h2>
        <p className="text-muted-foreground">{t("vocabularyCatalog.creditsNote")}</p>
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          <li><a className={sourceLinkStyle} href={KAIKKI_SOURCE}>Kaikki / Wiktionary</a></li>
          <li><a className={sourceLinkStyle} href={HO_NGOC_DUC_SOURCE}>Hồ Ngọc Đức</a></li>
          <li><a className={sourceLinkStyle} href="/tu-vung/nguon-va-giay-phep.txt">{t("vocabularyCatalog.licenseNotice")}</a></li>
        </ul>
      </footer>
    </main>
  );
}
