/** A denied storage getter must not prevent the player recovery UI from mounting. */
export function storedLanguage(): "vi" | "en" {
  try { return typeof window !== "undefined" && window.localStorage.getItem("app:language:v1") === "en" ? "en" : "vi"; }
  catch { return "vi"; }
}
