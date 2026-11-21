"use client";

import * as React from "react";
import { useDictionaryNavigation } from "@/hooks/useDictionaryDraft";
import { isUuid } from "@/lib/vua-tieng-viet/publication-contract";

const reviewHash = "#dictionary/review";
function desktopMedia() { return window.matchMedia("(min-width: 64rem)"); }
function subscribeDesktop(callback: () => void) {
  const media = desktopMedia();
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

export function useEditorialDetailNavigation(selected: string | null, setSelected: (id: string | null) => void) {
  const desktopViewport = React.useSyncExternalStore(subscribeDesktop, () => desktopMedia().matches, () => true);
  const [desktop, setDesktop] = React.useState(true);
  const guard = useDictionaryNavigation();
  const heading = React.useRef<HTMLHeadingElement | null>(null);
  const source = React.useRef<HTMLElement | null>(null);
  const historyEntry = React.useRef(false);
  const lastSelected = React.useRef(selected);

  React.useEffect(() => {
    const sync = (event?: HashChangeEvent) => {
      const hash = window.location.hash;
      const entry = hash.startsWith(`${reviewHash}/`) ? hash.slice(reviewHash.length + 1) : null;
      if (isUuid(entry)) {
        setDesktop(desktopMedia().matches);
        if (event && new URL(event.oldURL).hash === reviewHash) historyEntry.current = true;
        setSelected(entry);
      }
      else if (historyEntry.current || (event && new URL(event.oldURL).hash.startsWith(`${reviewHash}/`))) {
        historyEntry.current = false;
        setSelected(null);
      }
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [setSelected]);

  const restore = () => {
    if (window.location.hash === reviewHash && source.current?.isConnected) source.current.focus({ preventScroll: true });
  };
  React.useLayoutEffect(() => {
    if (selected) heading.current?.focus({ preventScroll: !desktop });
    else if (lastSelected.current && desktop) restore();
    lastSelected.current = selected;
  }, [desktop, selected]);
  const bindMobileSurface = React.useCallback((surface: HTMLDivElement | null) => {
    const viewport = window.visualViewport;
    if (!surface || !viewport) return;
    const update = () => {
      if (viewport.scale !== 1) {
        surface.style.removeProperty("--editorial-viewport-height");
        surface.style.removeProperty("--editorial-viewport-top");
        return;
      }
      surface.style.setProperty("--editorial-viewport-height", `${viewport.height}px`);
      surface.style.setProperty("--editorial-viewport-top", `${viewport.offsetTop}px`);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  const selectImmediately = (id: string, element?: HTMLElement) => {
    if (element) source.current = element;
    else if (document.activeElement instanceof HTMLElement) source.current = document.activeElement;
    if (!selected) setDesktop(desktopViewport);
    setSelected(id);
    if (!desktopViewport && !historyEntry.current && !selected) {
      historyEntry.current = true;
      window.history.pushState(window.history.state, "", `${reviewHash}/${id}`);
    }
  };
  const select = (id: string, element?: HTMLElement) => {
    if (selected === id) { heading.current?.focus(); return; }
    guard(() => selectImmediately(id, element));
  };
  const close = () => guard(() => {
    if (historyEntry.current) window.history.back();
    else {
      if (window.location.hash.startsWith(`${reviewHash}/`)) window.history.replaceState(window.history.state, "", reviewHash);
      setSelected(null);
    }
  });
  const openFocus = (event: Event) => {
    event.preventDefault();
    heading.current?.focus({ preventScroll: true });
  };
  const closeFocus = (event: Event) => { event.preventDefault(); restore(); };

  return { desktop, heading, bindMobileSurface, select, close, openFocus, closeFocus };
}
