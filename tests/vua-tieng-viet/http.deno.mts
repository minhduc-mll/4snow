import { handlePreview } from "../../lib/vua-tieng-viet/preview-handler.ts";

declare const Deno: {
  test(name: string, fn: () => Promise<void>): void;
  serve(options: { hostname: string; port: number; onListen: () => void }, handler: (request: Request) => Promise<Response>): { addr: { port: number }; shutdown(): Promise<void> };
};

Deno.test("direct HTTP requests enforce custom-token authorization", async () => {
  let rateCalls = 0;
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen: () => {} }, (request) => handlePreview(request, { secret: "test-secret", origins: ["https://app.example"], now: () => 1000, consumeLimit: async () => { rateCalls++; return 0; } }));
  const encode = (value: unknown): string => btoa(JSON.stringify(value)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const token = async (header: unknown, payload: unknown, secret: string): Promise<string> => {
    const input = `${encode(header)}.${encode(payload)}`;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input)));
    const text = Array.from(signature, (byte) => String.fromCharCode(byte)).join("");
    return `${input}.${btoa(text).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}`;
  };
  try {
    const valid = { role: "admin", iat: 999, exp: 1100 };
    const header = { alg: "HS256", typ: "JWT" };
    const rejected = ["", "invalid", await token(header, valid, "wrong"), await token(header, { ...valid, role: "user" }, "test-secret"), await token(header, { ...valid, exp: 1000 }, "test-secret"), await token(header, { ...valid, iat: 1031 }, "test-secret"), await token({ ...header, alg: "none" }, valid, "test-secret")];
    for (const value of rejected) {
      const response = await fetch(`http://127.0.0.1:${server.addr.port}/`, { method: "POST", headers: { Authorization: `Bearer ${value}`, "Content-Type": "application/json" }, body: "{}" });
      if (response.status !== 401) throw new Error(`Expected 401, got ${response.status}`);
    }
    if (rateCalls !== 0) throw new Error("Unauthorized request accessed rate limiter");
  } finally { await server.shutdown(); }
});
