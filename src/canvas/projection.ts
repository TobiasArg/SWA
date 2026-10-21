/**
 * Pure projection of the domain architecture onto controlled React Flow nodes and
 * edges (TD 6.2). The architecture is the only source of truth; nothing produced
 * here is persisted.
 *
 * - Group nodes come first (rendered underneath), then component nodes.
 * - No `parentId`: groups are siblings with absolute positions, never parents.
 * - Groups are never connection endpoints (`connectable: false`, no handles).
 */
import { MarkerType } from "@xyflow/react";
import { effectiveSize } from "../domain/geometry";
import type { Architecture, Selection } from "../domain/types";
import { computeParallelInfo } from "./floating";
import {
  COMPONENT_NODE_TYPE,
  GROUP_DRAG_HANDLE_CLASS,
  GROUP_NODE_TYPE,
  RELATIONSHIP_EDGE_TYPE,
  type CanvasNode,
  type ComponentFlowNode,
  type GroupFlowNode,
  type RelationshipFlowEdge,
} from "./flowTypes";
import { describeRelationship } from "../domain/selectors";
import { componentAriaLabel, relationshipCanvasLabel } from "./labels";

export const GROUP_Z_INDEX = 0;
export const EDGE_Z_INDEX = 5;
export const COMPONENT_Z_INDEX = 10;
export const EDGE_INTERACTION_WIDTH = 16;

export function toFlowNodes(architecture: Architecture, selection: Selection): CanvasNode[] {
  const selectedComponents = new Set(selection.componentIds);
  const selectedGroups = new Set(selection.groupIds);
  const groupNameByMember = new Map<string, string>();

  const groupNodes = architecture.groups.map((group): GroupFlowNode => {
    for (const memberId of group.memberComponentIds) {
      if (!groupNameByMember.has(memberId)) groupNameByMember.set(memberId, group.name);
    }
    return {
      id: group.id,
      type: GROUP_NODE_TYPE,
      position: { x: group.bounds.x, y: group.bounds.y },
      width: group.bounds.width,
      height: group.bounds.height,
      draggable: true,
      dragHandle: `.${GROUP_DRAG_HANDLE_CLASS}`,
      connectable: false,
      selectable: true,
      zIndex: GROUP_Z_INDEX,
      // React Flow sets `pointer-events: all` inline on node wrappers; the group
      // body must let clicks and box selection through (TD 6.5). The header and
      // outline re-enable pointer events in canvas.css.
      style: { pointerEvents: "none" },
      selected: selectedGroups.has(group.id),
      ariaLabel: `Group: ${group.name}`,
      domAttributes: { "aria-roledescription": "group" },
      data: { group },
    };
  });

  const componentNodes = architecture.components.map((component): ComponentFlowNode => {
    const size = effectiveSize(component);
    const groupName = groupNameByMember.get(component.id);
    return {
      id: component.id,
      type: COMPONENT_NODE_TYPE,
      position: { x: component.position.x, y: component.position.y },
      width: size.width,
      height: size.height,
      zIndex: COMPONENT_Z_INDEX,
      selected: selectedComponents.has(component.id),
      ariaLabel: componentAriaLabel(component),
      domAttributes: { "aria-roledescription": "component" },
      data: groupName === undefined ? { component } : { component, groupName },
    };
  });

  return [...groupNodes, ...componentNodes];
}

export function toFlowEdges(architecture: Architecture, selection: Selection): RelationshipFlowEdge[] {
  const selected = new Set(selection.relationshipIds);
  const parallel = computeParallelInfo(architecture.relationships);

  return architecture.relationships.map((relationship): RelationshipFlowEdge => {
    const info = parallel.get(relationship.id) ?? {
      parallelIndex: 0,
      parallelCount: 1,
      parallelOffset: 0,
      labelPosition: 0.5,
    };
    const edge: RelationshipFlowEdge = {
      id: relationship.id,
      type: RELATIONSHIP_EDGE_TYPE,
      source: relationship.sourceId,
      target: relationship.targetId,
      zIndex: EDGE_Z_INDEX,
      interactionWidth: EDGE_INTERACTION_WIDTH,
      selected: selected.has(relationship.id),
      label: relationshipCanvasLabel(relationship),
      ariaLabel: describeRelationship(architecture, relationship),
      data: { relationship, ...info },
    };
    if (relationship.direction === "directed") {
      edge.markerEnd = { type: MarkerType.ArrowClosed };
    }
    return edge;
  });
}
