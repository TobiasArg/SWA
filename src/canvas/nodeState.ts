/**
 * Local (transient) React Flow node state helpers. The domain projection is the
 * source of truth; local state only adds what React Flow tracks during a gesture.
 */
import type { NodeChange } from "@xyflow/react";
import type { TransientLayout } from "./dragController";
import { GROUP_NODE_TYPE, type CanvasNode } from "./flowTypes";

/** Node changes the canvas applies locally (TD 6.1). `remove`/`add`/`replace` are ignored. */
export function isAppliedNodeChange(change: NodeChange<CanvasNode>): boolean {
  return change.type === "position" || change.type === "dimensions" || change.type === "select";
}

/**
 * Re-sync local nodes from a fresh projection.
 *
 * - `measured` is carried over (as the projected fixed size) for nodes React Flow
 *   already knows, so it keeps its handle bounds and does not re-initialise nodes.
 * - With `preserveGestures`, nodes that are mid-drag or mid-resize keep their
 *   transient position/size, so an unrelated store update (for example a
 *   selection change at drag start) cannot snap them back.
 */
export function mergeProjectedNodes(
  projected: readonly CanvasNode[],
  previous: readonly CanvasNode[],
  preserveGestures: boolean,
): CanvasNode[] {
  const previousById = new Map(previous.map((node) => [node.id, node]));
  return projected.map((node): CanvasNode => {
    const prev = previousById.get(node.id);
    if (!prev || prev.type !== node.type) return node;

    if (preserveGestures && (prev.dragging || prev.resizing)) {
      return {
        ...node,
        position: prev.position,
        width: prev.width,
        height: prev.height,
        measured: prev.measured,
        dragging: prev.dragging,
        resizing: prev.resizing,
      } as CanvasNode;
    }

    if (node.width === undefined || node.height === undefined) return node;
    return { ...node, measured: { width: node.width, height: node.height } } as CanvasNode;
  });
}

/**
 * Writes a drag controller's transient layout into local nodes: positions of
 * moving components, and position + size of affected groups. Nodes the layout
 * does not mention are returned unchanged (same object).
 */
export function applyTransientLayout(nodes: readonly CanvasNode[], layout: TransientLayout): CanvasNode[] {
  return nodes.map((node): CanvasNode => {
    if (node.type === GROUP_NODE_TYPE) {
      const bounds = layout.groupBounds[node.id];
      if (!bounds) return node;
      if (
        node.position.x === bounds.x &&
        node.position.y === bounds.y &&
        node.width === bounds.width &&
        node.height === bounds.height
      ) {
        return node;
      }
      return {
        ...node,
        position: { x: bounds.x, y: bounds.y },
        width: bounds.width,
        height: bounds.height,
        measured: { width: bounds.width, height: bounds.height },
      };
    }
    const position = layout.componentPositions[node.id];
    if (!position || (node.position.x === position.x && node.position.y === position.y)) return node;
    return { ...node, position: { x: position.x, y: position.y } };
  });
}
