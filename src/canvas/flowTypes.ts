import type { Edge, Node } from "@xyflow/react";
import type { Component, Group, Relationship } from "../domain/types";
import type { ParallelInfo } from "./floating";

export const COMPONENT_NODE_TYPE = "component";
export const GROUP_NODE_TYPE = "group-container";
export const RELATIONSHIP_EDGE_TYPE = "relationship";

/** Selector React Flow uses to restrict group dragging to the header (TD 6.2). */
export const GROUP_DRAG_HANDLE_CLASS = "sa-group-header";

export type ComponentNodeData = {
  component: Component;
  groupName?: string;
};

export type GroupNodeData = {
  group: Group;
};

export type RelationshipEdgeData = ParallelInfo & {
  relationship: Relationship;
};

export type ComponentFlowNode = Node<ComponentNodeData, typeof COMPONENT_NODE_TYPE>;
export type GroupFlowNode = Node<GroupNodeData, typeof GROUP_NODE_TYPE>;
export type CanvasNode = ComponentFlowNode | GroupFlowNode;
export type RelationshipFlowEdge = Edge<RelationshipEdgeData, typeof RELATIONSHIP_EDGE_TYPE>;

export function isComponentNode(node: CanvasNode): node is ComponentFlowNode {
  return node.type === COMPONENT_NODE_TYPE;
}

export function isGroupNode(node: CanvasNode): node is GroupFlowNode {
  return node.type === GROUP_NODE_TYPE;
}

/** The component of a node (plain or React Flow internal node), or null for groups and unknown nodes. */
export function nodeComponent(node: { type?: string; data: object } | null | undefined): Component | null {
  if (!node || node.type !== COMPONENT_NODE_TYPE) return null;
  return (node.data as ComponentNodeData).component;
}
