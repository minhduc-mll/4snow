import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

test("public shell fetches keep successful network responses when cache access or quota fails", async () => {
  const source = await readFile(new URL("../../public/vtv-round-worker.js",import.meta.url),"utf8");
  for (const failure of ["access","quota"]) {
    const listeners = new Map(), pending = [];
    runInNewContext(source,{
      self: { location: { origin: "https://game.invalid" }, addEventListener: (name,listener) => listeners.set(name,listener) },
      URL, Response,
      fetch: async () => new Response("online asset"),
      caches: { open: async () => { if (failure === "access") throw Error("denied"); return { put: async () => { throw Error("quota"); } }; } },
    });
    let response;
    listeners.get("fetch")({ request: new Request("https://game.invalid/_next/static/player.js"), respondWith: result => response = result, waitUntil: result => pending.push(result) });
    assert.equal(await (await response).text(),"online asset");
    await Promise.all(pending);
  }
});
