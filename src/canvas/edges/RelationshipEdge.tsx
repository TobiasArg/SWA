import { createContext, memo, useContext } from "react";
import { BaseEdge, useInternalNode, type EdgeProps } from "@xyflow/react";
import {
  LABEL_LINE_HEIGHT,
  LABEL_PAD_Y,
  edgeObstacles,
  flowEdgeLayout,
  layoutEdgeLabels,
  labelRequestFor,
  measureLabelText,
  type LabelPlacement,
} from "../edgeLabels";
import { internalNodeRect } from "../floating";
import type { CanvasNode, RelationshipFlowEdge } from "../flowTypes";

/**
 * Label placements for every edge, computed once per render by the canvas
 * (UI_V2_REFINEMENT.md 3.2). Null outside a canvas: the edge then places its own
 * label against its two nodes only (isolated rendering, tests).
 */
export const EdgeLabelLayoutContext = createContext<ReadonlyMap<string, LabelPlacement> | null>(null);

function EdgeLabel({ placement }: { placement: LabelPlacement }) {
  const { plate, lines, leader, mode } = placement;
  const cx = plate.x + plate.width / 2;
  const callout = mode === "callout";
  return (
    <g className="sa-edge-label" data-mode={mode}>
      {leader ? (
        <line className="sa-edge-leader" x1={leader.from.x} y1={leader.from.y} x2={leader.to.x} y2={leader.to.y} />
      ) : null}
      <rect
        className={callout ? "react-flow__edge-textbg sa-edge-label__plate--callout" : "react-flow__edge-textbg"}
        x={plate.x}
        y={plate.y}
        width={plate.width}
        height={plate.height}
        rx={3}
        ry={3}
      />
      <text className="react-flow__edge-text" textAnchor="middle" dominantBaseline="central">
        {lines.map((line, index) => (
          <tspan key={index} x={cx} y={plate.y + LABEL_PAD_Y + LABEL_LINE_HEIGHT * index + LABEL_LINE_HEIGHT / 2}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

/**
 * Relationship edge (UI v2 7.3, 8.5; UI_V2_REFINEMENT.md 2, 3).
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
 * - The label is drawn here (not by BaseEdge), at the placement the canvas
 *   computed for all edges: on the path, on the path in two lines, or as a
 *   callout with a dashed leader to B(labelPosition).
 */
function RelationshipEdgeView({ id, source, target, data, label, markerEnd, interactionWidth }: EdgeProps<RelationshipFlowEdge>) {
  const sourceNode = useInternalNode<CanvasNode>(source);
  const targetNode = useInternalNode<CanvasNode>(target);
  const placements = useContext(EdgeLabelLayoutContext);
  if (!sourceNode || !targetNode || !data) return null;

  const layout = flowEdgeLayout({ id, source, target, data, markerEnd }, sourceNode, targetNode);
  if (!layout) return null;
  const directed = layout.arrow !== null;

  const text = typeof label === "string" ? label : undefined;
  let placement = placements?.get(id);
  if (!placement) {
    // Isolated rendering (or an edge the canvas layout has not seen yet): lay
    // out against this edge's own nodes and decorations.
    const request = labelRequestFor({ id, text, geometry: layout });
    if (request) {
      const nodeBoxes = [internalNodeRect(sourceNode), internalNodeRect(targetNode)];
      placement = layoutEdgeLabels([request], [...nodeBoxes, ...edgeObstacles(layout)], measureLabelText, nodeBoxes).get(id);
    }
  }

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
      {placement ? <EdgeLabel placement={placement} /> : null}
    </>
  );
}

export const RelationshipEdge = memo(RelationshipEdgeView);
