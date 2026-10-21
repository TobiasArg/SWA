import { ACCENT_IDS, ACCENTS, isAccentId, type AccentId } from "./constants";
import type { Component } from "./types";

/** Type defaults expressed as palette entries (UI_COLOR_CONFIRMATION_DESIGN D-C3). */
export const TYPE_PALETTE_IDS = [
  "type-agent",
  "type-orchestrator",
  "type-tool",
  "type-memory",
  "type-external",
  "type-decision",
] as const;
export type TypePaletteId = (typeof TYPE_PALETTE_IDS)[number];
export type PaletteId = AccentId | TypePaletteId;

export const PALETTE_IDS: readonly PaletteId[] = [...TYPE_PALETTE_IDS, ...ACCENT_IDS];

/** The type default for a component (Orchestrator is keyed by subtype). */
export function typePaletteId(c: Pick<Component, "type" | "subtype">): TypePaletteId {
  switch (c.type) {
    case "agent":
      return c.subtype === "orchestrator" ? "type-orchestrator" : "type-agent";
    case "tool":
      return "type-tool";
    case "memory":
      return "type-memory";
    case "external_system":
      return "type-external";
    case "decision":
      return "type-decision";
  }
}

/** The one effective entry: a valid accent if set, else the type default. */
export function effectivePaletteId(c: Pick<Component, "type" | "subtype" | "accent">): PaletteId {
  return isAccentId(c.accent) ? c.accent : typePaletteId(c);
}

const TYPE_PALETTE: Record<TypePaletteId, { label: string; ink: string; fill: string }> = {
  "type-agent": { label: "Agent", ink: "#36597D", fill: "#EDF2F7" },
  "type-orchestrator": { label: "Orchestrator", ink: "#1D3557", fill: "#E6ECF4" },
  "type-tool": { label: "Tool", ink: "#875611", fill: "#FBF3E3" },
  "type-memory": { label: "Memory", ink: "#2E6A4C", fill: "#EBF4EE" },
  "type-external": { label: "External", ink: "#57534C", fill: "#F1EFEA" },
  "type-decision": { label: "Decision", ink: "#6C3D74", fill: "#F5EEF6" },
};

/** Hex values for tests and non-CSS consumers; mirrors tokens.css exactly. */
export const PALETTE: Record<PaletteId, { label: string; ink: string; fill: string }> = {
  ...TYPE_PALETTE,
  ...(Object.fromEntries(
    ACCENT_IDS.map((id) => [id, { label: ACCENTS[id].label, ink: ACCENTS[id].ink, fill: ACCENTS[id].tint }]),
  ) as Record<AccentId, { label: string; ink: string; fill: string }>),
};
