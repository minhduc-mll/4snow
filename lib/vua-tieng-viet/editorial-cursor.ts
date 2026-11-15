import { parseStrictJson } from "./strict-json.ts";

export type CursorPosition = { createdAt: string; id: string };
function encode(bytes: Uint8Array): string { return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join("")).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"); }
function decode(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) throw new Error("Invalid cursor");
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  if (encode(bytes) !== value) throw new Error("Invalid cursor");
  return bytes;
}
async function key(secret: string): Promise<CryptoKey> {
  if (!secret) throw new Error("Missing cursor key");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(`vtv-cursor:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function encodeEditorialCursor(secret: string, scope: string, position: CursorPosition): Promise<string> {
  const payload = encode(new TextEncoder().encode(JSON.stringify({ scope, ...position })));
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), new TextEncoder().encode(payload)));
  const token = `${payload}.${encode(signature)}`;
  if (token.length > 512) throw new Error("Cursor too long");
  return token;
}
export async function decodeEditorialCursor(secret: string, scope: string, token: string): Promise<CursorPosition> {
  try {
    if (token.length > 512) throw new Error("Invalid cursor");
    const parts = token.split(".");
    if (parts.length !== 2 || !await crypto.subtle.verify("HMAC", await key(secret), decode(parts[1]), new TextEncoder().encode(parts[0]))) throw new Error("Invalid cursor");
    const value = parseStrictJson(new TextDecoder("utf-8", { fatal: true }).decode(decode(parts[0])));
    if (typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).sort().join(",") !== "createdAt,id,scope" || !("scope" in value) || value.scope !== scope || !("id" in value) || typeof value.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.id) || !("createdAt" in value) || typeof value.createdAt !== "string" || value.createdAt.length > 40 || !Number.isFinite(Date.parse(value.createdAt))) throw new Error("Invalid cursor");
    return { createdAt: value.createdAt, id: value.id };
  } catch { throw new Error("Invalid cursor"); }
}
