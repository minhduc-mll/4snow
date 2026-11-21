"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { parseVocabulary, searchVocabulary, VOCABULARY_URL, vocabularySearchKey } from "@/lib/vua-tieng-viet/public-vocabulary";

const PAGE_SIZE = 40;

export function useVocabularyCatalog() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const query = useDeferredValue(vocabularySearchKey(search.trim()));
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["public-vocabulary", VOCABULARY_URL],
    queryFn: async ({ signal }) => {
      const response = await fetch(VOCABULARY_URL, { signal });
      if (!response.ok) throw new Error("Vocabulary unavailable");
      return parseVocabulary(await response.text());
    },
    retry: false,
    staleTime: Infinity,
  });
  const results = useMemo(() => data ? searchVocabulary(data, query) : undefined, [data, query]);
  const resultCount = results?.length ?? 0;
  const pageCount = Math.max(1, Math.ceil(resultCount / PAGE_SIZE));
  const pageIndex = Math.min(page, pageCount - 1);
  const offset = pageIndex * PAGE_SIZE;
  return {
    search, changeSearch: (value: string) => { setSearch(value); setPage(0); },
    rows: results?.slice(offset, offset + PAGE_SIZE) ?? [],
    offset, resultCount, pageIndex, pageCount, setPage, isPending, isError, refetch,
  };
}
