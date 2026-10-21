import { useEffect, useState } from "react";

/** Panel collapse preferences (TD 11.3, handoff 11) under the `sa:ui:` prefix (TD 8.1). */
export type PanelName = "palette" | "inspector";

const key = (panel: PanelName) => `sa:ui:${panel}-collapsed`;

export function readPanelCollapsed(panel: PanelName): boolean {
  try {
    return window.localStorage.getItem(key(panel)) === "1";
  } catch {
    return false;
  }
}

export function writePanelCollapsed(panel: PanelName, collapsed: boolean): void {
  try {
    if (collapsed) window.localStorage.setItem(key(panel), "1");
    else window.localStorage.removeItem(key(panel));
  } catch {
    // UI preferences are best effort.
  }
}

/** Width breakpoints from handoff 11. Without `matchMedia` (tests) the wide layout applies. */
export function mediaMatches(query: string): boolean {
  return typeof window.matchMedia === "function" ? window.matchMedia(query).matches : true;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => mediaMatches(query));

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/**
 * A panel starts expanded only when the width default allows it and no stored preference
 * collapses it: a stored preference wins only when it collapses (handoff 11).
 */
export function initialPanelExpanded(panel: PanelName, wideQuery: string): boolean {
  return !readPanelCollapsed(panel) && mediaMatches(wideQuery);
}

export const PALETTE_WIDE_QUERY = "(min-width: 1280px)";
export const INSPECTOR_DOCKED_QUERY = "(min-width: 1024px)";
