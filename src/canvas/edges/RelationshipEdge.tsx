import { memo } from "react";
import { BaseEdge, getStraightPath, useInternalNode, type EdgeProps } from "@xyflow/react";
import { arrowheadGeometry, getFloatingEdgeGeometry, internalNodeRect } from "../floating";
import type { RelationshipFlowEdge } from "../flowTypes";

const LABEL_BG_PADDING: [number, number] = [6, 2];

/**
 * Floating straight relationship edge (TD 6.4, UI handoff 6).
 *
 * - Endpoints sit on the node borders (center-to-center line), offset
 *   perpendicular for parallel relationships, whose labels are also spread
 *   along the line.
 * - Directed edges get an arrowhead at the target only. The arrowhead is drawn
 *   inline as part of this edge (instead of React Flow's shared `<marker>` defs)
 *   so it follows the edge's hover/selected stroke colour through CSS and is
 *   always part of the exported SVG. Its presence is driven by the projection's
 *   `markerEnd` (set only for directed relationships).
 * - Undirected edges: dashed stroke, no markers at either end.
 * - The label is SVG text (BaseEdge `label`), so PNG export includes it.
 */
function RelationshipEdgeView({ source, target, data, label, markerEnd, interactionWidth }: EdgeProps<RelationshipFlowEdge>) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode || !data) return null;

  const directed = data.relationship.direction === "directed" && Boolean(markerEnd);
  const geometry = getFloatingEdgeGeometry(
    internalNodeRect(sourceNode),
    internalNodeRect(targetNode),
    data.parallelOffset,
    data.labelPosition,
  );
  const arrow = directed ? arrowheadGeometry(geometry) : null;
  const [path] = getStraightPath({
    sourceX: geometry.sourceX,
    sourceY: geometry.sourceY,
    targetX: arrow ? arrow.lineEndX : geometry.targetX,
    targetY: arrow ? arrow.lineEndY : geometry.targetY,
  });

  return (
    <>
      <BaseEdge
        path={path}
        className={directed ? "sa-edge-path" : "sa-edge-path sa-edge-path--undirected"}
        interactionWidth={interactionWidth}
        label={label}
        labelX={geometry.labelX}
        labelY={geometry.labelY}
        labelShowBg
        labelBgPadding={LABEL_BG_PADDING}
        labelBgBorderRadius={3}
      />
      {arrow ? <path className="sa-edge-arrow" d={arrow.path} /> : null}
    </>
  );
}

export const RelationshipEdge = memo(RelationshipEdgeView);
