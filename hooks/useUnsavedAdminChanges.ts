"use client";

import * as React from "react";

/** Warn before leaving the Lucky Draw editor, including browser history navigation. */
export function useUnsavedAdminChanges(dirty: boolean, message: string): void {
  React.useEffect(() => {
    if (!dirty) return;
    let approvedNavigation = false;
    const inEditor = (url: URL) => url.pathname === "/admin" && url.hash.split("/")[0] === "#lucky-draw";
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest("[data-admin-logout]")) {
        if (!window.confirm(message)) { event.preventDefault(); event.stopPropagation(); }
        return;
      }
      if (!inEditor(new URL(window.location.href))) return;
      const link = event.target.closest("a[href]");
      if (!(link instanceof HTMLAnchorElement) || inEditor(new URL(link.href))) return;
      if (!window.confirm(message)) { event.preventDefault(); event.stopPropagation(); return; }
      const destination = new URL(link.href);
      approvedNavigation = destination.origin === window.location.origin && destination.pathname === window.location.pathname && destination.search === window.location.search;
    };
    const onHashChange = (event: HashChangeEvent) => {
      if (inEditor(new URL(event.oldURL)) && !inEditor(new URL(event.newURL))) {
        if (approvedNavigation) { approvedNavigation = false; return; }
        if (!window.confirm(message)) {
          window.history.pushState(null, "", event.oldURL);
          window.dispatchEvent(new HashChangeEvent("hashchange", { oldURL: event.newURL, newURL: event.oldURL }));
        }
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    window.addEventListener("hashchange", onHashChange);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("hashchange", onHashChange);
    };
  }, [dirty, message]);
}
