import type { Metadata } from "next";
import { WordGame } from "@/components/organisms/vua-tieng-viet/WordGame";

export const metadata: Metadata = { title: "Vua Tiếng Việt" };

export default function VuaTiengVietPage() {
  return <WordGame />;
}
