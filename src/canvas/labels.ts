/**
 * Canvas-only display text. The relationship wording itself (display label and
 * aria sentence) comes from `domain/selectors` (TD 5.1, 6.4); this module only
 * adds the canvas truncation and the node labels.
 */
import { COMPONENT_TYPE_LABELS } from "../domain/constants";
import { relationshipDisplayLabel } from "../domain/selectors";
import type { Component, Relationship } from "../domain/types";

/** Maximum number of characters an edge label shows on the canvas (TD 6.4). */
export const CANVAS_LABEL_MAX = 40;

/** Truncates to at most `max` characters (code points), ending with "…" when cut. */
export function truncateLabel(text: string, max: number = CANVAS_LABEL_MAX): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars.slice(0, Math.max(0, max - 1)).join("")}…`;
}

/** The label drawn on the canvas: the display label truncated to 40 characters. */
export function relationshipCanvasLabel(relationship: Relationship): string {
  return truncateLabel(relationshipDisplayLabel(relationship));
}

/** "Orchestrator" for orchestrator agents, otherwise the component type display name. */
export function componentTypeDisplay(component: Pick<Component, "type" | "subtype">): string {
  if (component.type === "agent" && component.subtype === "orchestrator") return "Orchestrator";
  return COMPONENT_TYPE_LABELS[component.type];
}

/** Short uppercase type label shown on nodes (UI handoff 5.1). */
export function componentTypeTag(component: Pick<Component, "type" | "subtype">): string {
  if (component.type === "agent") {
    return component.subtype === "orchestrator" ? "ORCHESTRATOR" : "AGENT";
  }
  switch (component.type) {
    case "tool":
      return "TOOL";
    case "memory":
      return "DATA STORE";
    case "external_system":
      return "EXTERNAL";
    case "decision":
      return "DECISION";
  }
}

/** Node aria-label (TD 6.2, 12): "{Type display}: {name}. {description}". */
export function componentAriaLabel(component: Component): string {
  const base = `${componentTypeDisplay(component)}: ${component.name}.`;
  const description = component.description?.trim();
  return description ? `${base} ${description}` : base;
}
