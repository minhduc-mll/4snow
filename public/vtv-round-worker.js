/* Public player shell only. Round data stays in its validated localStorage envelope. */
const SHELL_CACHE = "vtv:player-shell:v1";
const PLAYER_PATH = "/vua-tieng-viet";
function allowed(url) {
  return url.origin === self.location.origin && !url.search && (url.pathname === PLAYER_PATH || url.pathname.startsWith("/_next/static/") || /^\/locales\/(vi|en)\/common\.json$/.test(url.pathname));
}
self.addEventListener("install", event => { event.waitUntil(self.skipWaiting()); });
self.addEventListener("activate", event => { event.waitUntil(self.clients.claim()); });
self.addEventListener("message", event => {
  const data = event.data;
  if (data?.type !== "PREPARE_PLAYER" || !Array.isArray(data.urls) || data.urls.length > 256 || !event.ports[0]) return;
  event.waitUntil((async () => {
    try {
      const urls = [...new Set(data.urls)];
      if (!urls.every(value => typeof value === "string" && allowed(new URL(value)))) throw new Error("Invalid asset list");
      const cache = await caches.open(SHELL_CACHE);
      for (const url of urls) {
        if (await cache.match(url)) continue;
        const response = await fetch(url,{ credentials: "omit", cache: "no-cache" });
        if (!response.ok || response.redirected) throw new Error("Asset unavailable");
        await cache.put(url,response);
      }
      event.ports[0].postMessage({ ready: true });
    } catch { event.ports[0].postMessage({ ready: false }); }
  })());
});
self.addEventListener("fetch", event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== "GET" || !allowed(url)) return;
  event.respondWith((async () => {
    let response;
    try {
      response = await fetch(request);
    } catch {
      try {
        const cached = await (await caches.open(SHELL_CACHE)).match(request);
        if (cached) return cached;
      } catch { /* Denied caches cannot provide an offline fallback. */ }
      return Response.error();
    }
    if (response.ok && !response.redirected) {
      const copy = response.clone();
      event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.put(request,copy)).catch(() => { /* Online loading remains available when caching fails. */ }));
    }
    return response;
  })());
});
