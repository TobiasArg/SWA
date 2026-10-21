import { memo } from "react";
import { BaseEdge, useInternalNode, type EdgeProps, type InternalNode } from "@xyflow/react";
import { internalNodeRect, layoutRelationship } from "../floating";
import { nodeComponent, type CanvasNode, type RelationshipFlowEdge } from "../flowTypes";
import { shapeKindFor, type ShapeKind } from "../shapes";

const LABEL_BG_PADDING: [number, number] = [6, 2];

/** Shape of a component node (ports sit on its silhouette); rounded for anything else. */
function nodeShapeKind(node: InternalNode<CanvasNode>): ShapeKind {
  const component = nodeComponent(node);
  return component ? shapeKindFor(component) : "rounded";
}

/**
 * Relationship edge (UI v2 7.3, 8.5).
 *
 * - Sides come from the stored pins (`visual.ports`), else the deterministic
 *   automatic rule, evaluated against the live node rects, so automatic edges
 *   re-route when a node moves.
 * - The path is a cubic between the port anchors on the silhouettes. Both ends
 *   carry identical terminal rings (no direction cue).
 * - Directed edges get an inline arrowhead at the target only (no `<marker>`,
 *   no url() references, so PNG export needs no ID resolution). Its presence is
 *   driven by the projection's `markerEnd` (set only for directed relationships).
 * - Undirected edges: dashed stroke, no arrowheads. Never animated.
 * - The label is SVG text (BaseEdge `label`) at the cubic point B(labelPosition).
 */
function RelationshipEdgeView({ source, target, data, label, markerEnd, interactionWidth }: EdgeProps<RelationshipFlowEdge>) {
  const sourceNode = useInternalNode<CanvasNode>(source);
  const targetNode = useInternalNode<CanvasNode>(target);
  if (!sourceNode || !targetNode || !data) return null;

  const directed = data.relationship.direction === "directed" && Boolean(markerEnd);
  const layout = layoutRelationship({
    relationship: { ...data.relationship, direction: directed ? "directed" : "undirected" },
    sourceRect: internalNodeRect(sourceNode),
    targetRect: internalNodeRect(targetNode),
    sourceKind: nodeShapeKind(sourceNode),
    targetKind: nodeShapeKind(targetNode),
    parallelOffset: data.parallelOffset,
    labelPosition: data.labelPosition,
  });

  // Geometry emits undirected terminals in canonical order; the DOM keeps the stored roles.
  const [sourceTerminal, targetTerminal] = layout.canonicalSwap
    ? [layout.targetTerminal, layout.sourceTerminal]
    : [layout.sourceTerminal, layout.targetTerminal];

  return (
    <>
      <BaseEdge
        path={layout.path}
        className={directed ? "sa-edge-path" : "sa-edge-path sa-edge-path--undirected"}
        interactionWidth={interactionWidth}
        label={label}
        labelX={layout.labelX}
        labelY={layout.labelY}
        labelShowBg
        labelBgPadding={LABEL_BG_PADDING}
        labelBgBorderRadius={3}
      />
      <circle
        className="sa-edge-terminal"
        data-terminal="source"
        data-side={layout.sides.source}
        cx={sourceTerminal.x}
        cy={sourceTerminal.y}
        r={layout.terminalRadius}
      />
      <circle
        className="sa-edge-terminal"
        data-terminal="target"
        data-side={layout.sides.target}
        cx={targetTerminal.x}
        cy={targetTerminal.y}
        r={layout.terminalRadius}
      />
      {layout.arrow ? <path className="sa-edge-arrow" d={layout.arrow.path} /> : null}
    </>
  );
}

export const RelationshipEdge = memo(RelationshipEdgeView);
