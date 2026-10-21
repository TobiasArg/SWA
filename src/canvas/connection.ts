/**
 * Relationship creation helpers shared by the pointer flow (handle drag →
 * RelationshipTypePicker) and the keyboard flow (ConnectDialog), TD 6.3.
 */
import { RELATIONSHIP_TYPES } from "../domain/constants";
import { createRelationship } from "../domain/factories";
import { isPortSide, type PortPins, type PortSide } from "../domain/ports";
import type { Relationship, RelationshipType } from "../domain/types";
import type { EditorStore } from "../editor/storeTypes";
import type { Position, Rect } from "../domain/types";
import { autoPortFor, type ShapeKind } from "./shapes";

/** The 10 relationship types in their canonical order (TD 3.2). */
export const RELATIONSHIP_TYPE_ORDER = Object.keys(RELATIONSHIP_TYPES) as RelationshipType[];

/** Default type of the Connect dialog. */
export const DEFAULT_CONNECT_TYPE: RelationshipType = "delegates_to";

/** One-line "reads as" hint for a type, e.g. "Source reads from target". */
export function readsAsHint(type: RelationshipType): string {
  if (type === "shares_context_with") return "Source and target share context";
  return `Source ${RELATIONSHIP_TYPES[type].verb} target`;
}

/** Direction rule of a type, as shown before it is chosen. */
export function directionNote(type: RelationshipType): string {
  const mode = RELATIONSHIP_TYPES[type].direction;
  if (mode === "undirected") return "Undirected (fixed by type): drawn without arrowheads.";
  if (mode === "directed") return "Directed (fixed by type): the arrow points to the target.";
  return "Directed by default. You can make it undirected in the inspector.";
}

/**
 * Dispatches ONE `addRelationship` (direction = the type's default direction)
 * and selects the new relationship. Returns its id, or null when rejected.
 */
export function addRelationshipAndSelect(
  store: EditorStore,
  type: RelationshipType,
  sourceId: string,
  targetId: string,
  pins?: PortPins,
): string | null {
  const relationship: Relationship = createRelationship(type, sourceId, targetId);
  // Only pointer connections carry pins (UI v2 8.1); the Connect dialog stores no `visual`.
  if (pins && (pins.source || pins.target)) relationship.visual = { ports: { ...pins } };
  const result = store.dispatch({ kind: "addRelationship", relationship }, { label: "Add relationship" });
  if (!result.ok) return null;
  store.setSelection({ componentIds: [], relationshipIds: [relationship.id], groupIds: [] });
  return relationship.id;
}

/**
 * Pins captured by a pointer connection (UI v2 8.1). The pressed port always
 * pins the source; the release handle pins the target only when the pointer was
 * released on (or snapped to) a port, never for a body drop.
 */
export function capturePins(sourceHandle: string | null | undefined, targetHandle: string | null | undefined): PortPins {
  return {
    ...(isPortSide(sourceHandle) ? { source: sourceHandle } : {}),
    ...(isPortSide(targetHandle) ? { target: targetHandle } : {}),
  };
}

export type ConnectionStatus = "valid" | "invalid";

export interface ConnectionTarget {
  status: ConnectionStatus;
  /** The target component id when the status is valid. */
  targetId: string | null;
}

/**
 * Resolves what is under the pointer during a connection drag. Only another
 * component node is a valid target; the pane, a group (header or outline) and
 * the source node itself are invalid (TD 6.3). Because group bodies ignore
 * pointer events, a point inside a group but outside its members hits the pane.
 */
export function resolveConnectionTarget(
  element: Element | null,
  sourceId: string,
  componentIds: ReadonlySet<string>,
): ConnectionTarget {
  const node = element?.closest(".react-flow__node");
  const id = node?.getAttribute("data-id") ?? null;
  if (id && id !== sourceId && componentIds.has(id)) return { status: "valid", targetId: id };
  return { status: "invalid", targetId: null };
}

/** Client coordinates of a mouse or touch event (the touch that ended for touchend). */
export function eventClientPoint(event: MouseEvent | TouchEvent): { x: number; y: number } | null {
  if ("changedTouches" in event) {
    const touch = event.changedTouches[0] ?? event.touches[0];
    return touch ? { x: touch.clientX, y: touch.clientY } : null;
  }
  return { x: event.clientX, y: event.clientY };
}

/**
 * The port highlighted on the hovered target (UI v2 8.2): the snapped port when
 * the pointer is within the connection radius of one, otherwise the automatic
 * choice for a body hover, `autoPortFor(T, pinned source anchor)`. This is the
 * same function the edge uses for an automatic end next to a pinned one, so
 * the preview equals the final render.
 */
export function activeTargetPort(input: {
  snappedSide: PortSide | null;
  targetKind: ShapeKind;
  targetRect: Rect;
  sourceAnchor: Position;
}): PortSide {
  return input.snappedSide ?? autoPortFor(input.targetKind, input.targetRect, input.sourceAnchor);
}
