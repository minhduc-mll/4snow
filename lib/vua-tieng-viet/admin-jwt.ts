import { parseStrictJson } from "./strict-json.ts";

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) throw new Error("Invalid token");
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function verifyCustomAdminJwt(token: string, secret: string, now: number): Promise<boolean> {
  try {
    if (!secret || token.length > 8192 || !Number.isSafeInteger(now)) return false;
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const [header, payload, signature] = parts;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("HMAC", key, decodeBase64Url(signature), new TextEncoder().encode(`${header}.${payload}`));
    if (!valid) return false;
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const parsedHeader = parseStrictJson(decoder.decode(decodeBase64Url(header)));
    const claims = parseStrictJson(decoder.decode(decodeBase64Url(payload)));
    if (typeof parsedHeader !== "object" || parsedHeader === null || !("alg" in parsedHeader) || parsedHeader.alg !== "HS256" || !("typ" in parsedHeader) || parsedHeader.typ !== "JWT") return false;
    if (typeof claims !== "object" || claims === null || !("role" in claims) || claims.role !== "admin" || !("iat" in claims) || typeof claims.iat !== "number" || !Number.isSafeInteger(claims.iat) || !("exp" in claims) || typeof claims.exp !== "number" || !Number.isSafeInteger(claims.exp)) return false;
    if (claims.exp <= now || claims.exp <= claims.iat || claims.iat > now + 30) return false;
    if ("nbf" in claims && (typeof claims.nbf !== "number" || !Number.isSafeInteger(claims.nbf) || claims.nbf > now)) return false;
    return true;
  } catch {
    return false;
  }
}
