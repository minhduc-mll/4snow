import type { PublicAttribution } from "@/types/vua-tieng-viet";
import { safeHttps } from "@/lib/vua-tieng-viet/safe-link";
import { useAppI18n } from "@/hooks/useAppI18n";
import styles from "@/components/organisms/vua-tieng-viet/word-game.module.css";

type Props = { items: PublicAttribution[]; sourceOnly?: boolean };
export function WordAttributions({ items, sourceOnly = false }: Props) {
  const { t } = useAppI18n();
  const sources = sourceOnly ? items.filter((item,index) => items.findIndex(other =>
    other.artifactSha256 === item.artifactSha256 && other.sourceName === item.sourceName &&
    other.resourceRevision === item.resourceRevision && other.artifactRevision === item.artifactRevision &&
    other.licenseUrl === item.licenseUrl && other.attributionText === item.attributionText
  ) === index) : items;
  return <section className={styles.attribution} aria-label={t("wordGame.sources")}>
    <h3>{t("wordGame.sources")}</h3>
    {sources.map(item => <div key={item.id} className="grid gap-1">
      <p>{item.sourceName} · {item.attributionText}</p>
      <p>{item.licenseName} {item.licenseVersion} · {item.modificationsNotice}</p>
      <p className="break-all">{sourceOnly ? null : `${item.sourceEntryId} ${item.sourceSenseId ?? ""} · `}{item.resourceRevision} / {item.artifactRevision}</p>
      <div className="flex flex-wrap gap-3">{[...(sourceOnly ? [] : [{ label: t("editorial.sourceLink"), url: item.entryUrl }]), { label: t("editorial.artifactLink"), url: item.artifactUrl }, { label: t("editorial.licenseLink"), url: item.licenseUrl }, { label: t("editorial.historyLink"), url: item.historyUrl }].map(link => { const href = safeHttps(link.url); return href && (!sourceOnly || href !== safeHttps(item.entryUrl)) ? <a key={link.label} href={href} className="underline" target="_blank" rel="noopener noreferrer">{link.label}</a> : null; })}</div>
    </div>)}
  </section>;
}
