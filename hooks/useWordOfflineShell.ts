"use client";

import * as React from "react";

type OfflineReadiness = "preparing" | "ready" | "unavailable";
async function prepareShell(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  if (navigator.onLine) await navigator.serviceWorker.register("/vtv-round-worker.js",{ scope: "/vua-tieng-viet" });
  else if (!(await navigator.serviceWorker.getRegistration("/vua-tieng-viet"))) return false;
  const registration = await navigator.serviceWorker.ready;
  const worker = registration.active;
  if (!worker) return false;
  const assets = performance.getEntriesByType("resource").map(entry => new URL(entry.name)).filter(url => url.origin === location.origin && !url.search && url.pathname.startsWith("/_next/static/")).map(url => url.href);
  const urls = [...new Set([`${location.origin}/vua-tieng-viet`,`${location.origin}/locales/vi/common.json`,`${location.origin}/locales/en/common.json`,...assets])];
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const finish = (ready: boolean) => { clearTimeout(timeout); channel.port1.close(); resolve(ready); };
    const timeout = setTimeout(() => finish(false),15000);
    channel.port1.onmessage = (event: MessageEvent<unknown>) => finish(typeof event.data === "object" && event.data !== null && "ready" in event.data && event.data.ready === true);
    worker.postMessage({ type: "PREPARE_PLAYER", urls },[channel.port2]);
  });
}
export function useWordOfflineShell(): OfflineReadiness {
  const [readiness,setReadiness] = React.useState<OfflineReadiness>("preparing");
  React.useEffect(() => {
    let active = true;
    void prepareShell().then(ready => { if (active) setReadiness(ready ? "ready" : "unavailable"); }).catch(() => { if (active) setReadiness("unavailable"); });
    return () => { active = false; };
  },[]);
  return readiness;
}
