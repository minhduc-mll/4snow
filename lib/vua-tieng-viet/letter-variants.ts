export type VariantBase = "A" | "E" | "I" | "O" | "U" | "Y" | "D";
const variants: Readonly<Record<VariantBase, readonly string[]>> = {
  A: Array.from("AÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬ"),
  E: Array.from("EÈÉẺẼẸÊỀẾỂỄỆ"),
  I: Array.from("IÌÍỈĨỊ"),
  O: Array.from("OÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢ"),
  U: Array.from("UÙÚỦŨỤƯỪỨỬỮỰ"),
  Y: Array.from("YỲÝỶỸỴ"),
  D: Array.from("DĐ"),
};
export function variantsFor(letter: string): readonly string[] {
  if (letter === "A" || letter === "E" || letter === "I" || letter === "O" || letter === "U" || letter === "Y" || letter === "D") return variants[letter];
  return [];
}
