import type { Metadata } from "next";
import { VocabularyCatalog } from "@/components/organisms/vua-tieng-viet/VocabularyCatalog";

export const metadata: Metadata = {
  title: "Danh mục từ vựng tiếng Việt",
  description: "Tra cứu 81.513 cách viết và cụm từ tiếng Việt từ Wiktionary và danh sách Hồ Ngọc Đức.",
};

export default function VocabularyCatalogPage() {
  return <VocabularyCatalog />;
}
