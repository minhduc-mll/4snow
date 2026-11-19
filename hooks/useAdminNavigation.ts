"use client";

import * as React from "react";

type Section = "overview" | "lucky-draw" | "quiz" | "dictionary";
const sections: Section[] = ["overview", "lucky-draw", "quiz", "dictionary"];
function readSection(): Section {
  const section = window.location.hash.slice(1).split("/")[0];
  return sections.find((item) => item === section) ?? "overview";
}
function subscribeSection(callback: () => void): () => void {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}
function serverSection(): Section { return "overview"; }

export function useAdminNavigation() {
  const section = React.useSyncExternalStore(subscribeSection, readSection, serverSection);
  const scrollPositions = React.useRef<Partial<Record<Section, number>>>({});
  React.useLayoutEffect(() => {
    const positions = scrollPositions.current;
    window.scrollTo(0, positions[section] ?? 0);
    const recordPosition = () => { positions[section] = window.scrollY; };
    window.addEventListener("scroll", recordPosition, { passive: true });
    return () => window.removeEventListener("scroll", recordPosition);
  }, [section]);
  return { section, sections };
}
