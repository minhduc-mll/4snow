export const VOCABULARY_URL = "/tu-vung/tu-tieng-viet-tong-hop.tsv";
export const KAIKKI_SOURCE = "https://kaikki.org/viwiktionary/rawdata.html";
export const HO_NGOC_DUC_SOURCE = "https://github.com/duyet/vietnamese-wordlist/tree/688b0953c8cdb21ee090ce80b83cefdb052fe2cd";

export type VocabularyEntry = {
  spelling: string;
  searchKey: string;
  wiktionary: boolean;
  hoNgocDuc: boolean;
};

export function vocabularySearchKey(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase("vi");
}

export function parseVocabulary(tsv: string): VocabularyEntry[] {
  const [header, ...rows] = tsv.trimEnd().split(/\r?\n/);
  if (header !== "tu\tkaikki_viwiktionary\tho_ngoc_duc" || !rows.length) {
    throw new Error("Invalid vocabulary catalog");
  }
  return rows.map((row) => {
    const columns = row.split("\t");
    const [encoded, wiktionary, hoNgocDuc] = columns;
    if (columns.length !== 3 || !encoded || !/^[01]$/.test(wiktionary) || !/^[01]$/.test(hoNgocDuc)
      || (wiktionary === "0" && hoNgocDuc === "0")) throw new Error("Invalid vocabulary row");
    const spelling = encoded.replace(/\\([\\t])/g, (_, escape: string) => escape === "t" ? "\t" : "\\");
    return { spelling, searchKey: vocabularySearchKey(spelling), wiktionary: wiktionary === "1", hoNgocDuc: hoNgocDuc === "1" };
  });
}

export function wiktionaryEntryUrl(spelling: string): string {
  const url = new URL("https://vi.wiktionary.org/w/index.php");
  url.searchParams.set("title", spelling.replaceAll(" ", "_"));
  return url.href;
}
