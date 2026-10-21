import { DEFAULT_SIZE } from "../domain/constants";
import { createComponent } from "../domain/factories";
import type { Component, ComponentType, Position } from "../domain/types";
import type { EditorStore } from "../editor/storeTypes";
import type { IconName } from "../ui/icons";

export const PALETTE_DRAG_MIME = "application/x-swarm-component";

export interface PaletteDragPayload {
  type: ComponentType;
  subtype?: "orchestrator";
}

export interface PaletteItem extends PaletteDragPayload {
  /** Stable key, also used for the CSS ink modifier. */
  key: "orchestrator" | "agent" | "tool" | "memory" | "external" | "decision";
  label: string;
  icon: IconName;
}

export const PALETTE_ITEMS: readonly PaletteItem[] = [
  { key: "orchestrator", type: "agent", subtype: "orchestrator", label: "Orchestrator", icon: "orchestrator" },
  { key: "agent", type: "agent", label: "Agent", icon: "agent" },
  { key: "tool", type: "tool", label: "Tool", icon: "tool" },
  { key: "memory", type: "memory", label: "Memory / Data Store", icon: "memory" },
  { key: "external", type: "external_system", label: "External System", icon: "external" },
  { key: "decision", type: "decision", label: "Decision / Routing Rule", icon: "decision" },
];

const COMPONENT_TYPES: readonly ComponentType[] = [
  "agent",
  "tool",
  "memory",
  "external_system",
  "decision",
];

function isComponentType(value: unknown): value is ComponentType {
  return typeof value === "string" && (COMPONENT_TYPES as readonly string[]).includes(value);
}

export function writePaletteDragPayload(
  dataTransfer: DataTransfer,
  payload: PaletteDragPayload,
): void {
  const data: PaletteDragPayload =
    payload.subtype === "orchestrator" ? { type: payload.type, subtype: "orchestrator" } : { type: payload.type };
  dataTransfer.setData(PALETTE_DRAG_MIME, JSON.stringify(data));
  dataTransfer.effectAllowed = "copy";
}

/**
 * Reads a palette drag payload. Drag data is untrusted (it can come from other
 * pages or apps), so the payload is validated strictly: only known types, and
 * `subtype` only as "orchestrator" on an agent. Anything else returns null.
 */
export function readPaletteDragPayload(
  dataTransfer: Pick<DataTransfer, "getData"> | null | undefined,
): PaletteDragPayload | null {
  if (!dataTransfer) return null;
  let raw: string;
  try {
    raw = dataTransfer.getData(PALETTE_DRAG_MIME);
  } catch {
    return null;
  }
  if (!raw || raw.length > 256) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;

  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.some((key) => key !== "type" && key !== "subtype")) return null;
  if (!isComponentType(record.type)) return null;

  if (record.subtype === undefined) return { type: record.type };
  if (record.subtype === "orchestrator" && record.type === "agent") {
    return { type: "agent", subtype: "orchestrator" };
  }
  return null;
}

/**
 * Builds a new component for a palette item through the domain factory
 * (`createComponent`, TD 5.1): default name with the smallest free numeric
 * suffix ("Agent", "Agent 2", …), a generated `cmp_` id, no explicit size.
 */
export function createPaletteComponent(
  item: PaletteDragPayload,
  position: Position,
  existingNames: Iterable<string>,
): Component {
  return createComponent(item.type, {
    ...(item.type === "agent" && item.subtype === "orchestrator" ? { subtype: "orchestrator" as const } : {}),
    position: { x: position.x, y: position.y },
    existingNames,
  });
}

/**
 * Adds a component with its top-left at `position` (rounded to integers) as a
 * single `addComponent` command, then selects it. Returns the new id, or null
 * when the store rejected the command. Used by palette click-add and by the
 * canvas drop handler (drop point = top-left, TD 6.3).
 */
export function addComponentAt(
  store: EditorStore,
  item: PaletteDragPayload,
  position: Position,
): string | null {
  const existingNames = store.getState().architecture.components.map((component) => component.name);
  const component = createPaletteComponent(
    item,
    { x: Math.round(position.x), y: Math.round(position.y) },
    existingNames,
  );
  const result = store.dispatch({ kind: "addComponent", component });
  if (!result.ok) return null;
  store.setSelection({ componentIds: [component.id], relationshipIds: [], groupIds: [] });
  return component.id;
}

/** Top-left that centers a component of the item's default size on `center`. */
export function centeredTopLeft(item: PaletteDragPayload, center: Position): Position {
  const size = DEFAULT_SIZE[item.type];
  return { x: center.x - size.width / 2, y: center.y - size.height / 2 };
}
