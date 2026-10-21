import type { ConnectionLineComponentProps } from "@xyflow/react";
import { isPortSide, type PortSide } from "../domain/ports";
import { connectionPreviewGeometry, internalNodeRect } from "./floating";
import { nodeComponent, type CanvasNode } from "./flowTypes";
import { absolutePortAnchor, shapeKindFor } from "./shapes";

/**
 * Connection line while dragging from a port (UI v2 8.1): a dashed preview cubic
 * from the source anchor along its normal to the pointer, ending in a small dot.
 * Snapped to another component's port, it ends at that port's anchor and
 * arrives along that port's normal. Colour comes from canvas.css: active colour
 * by default, danger while the canvas host reports an invalid target
 * (`data-connecting="invalid"`) or React Flow reports an invalid handle.
 */
export function ConnectionLine({
  fromNode,
  fromHandle,
  fromX,
  fromY,
  toX,
  toY,
  toNode,
  toHandle,
  connectionStatus,
}: ConnectionLineComponentProps<CanvasNode>) {
  const fromSide: PortSide = isPortSide(fromHandle?.id) ? fromHandle.id : "right";
  const fromComponent = nodeComponent(fromNode);
  const sourceAnchor =
    isPortSide(fromHandle?.id) && fromComponent
      ? absolutePortAnchor(shapeKindFor(fromComponent), internalNodeRect(fromNode), fromSide)
      : { x: fromX, y: fromY };

  let snapped: { anchor: { x: number; y: number }; side: PortSide } | null = null;
  const toComponent = nodeComponent(toNode);
  if (connectionStatus !== "invalid" && toNode && toNode.id !== fromNode.id && toComponent && isPortSide(toHandle?.id)) {
    snapped = {
      anchor: absolutePortAnchor(shapeKindFor(toComponent), internalNodeRect(toNode), toHandle.id),
      side: toHandle.id,
    };
  }

  const preview = connectionPreviewGeometry({
    sourceAnchor,
    sourceSide: fromSide,
    pointer: { x: toX, y: toY },
    snapped,
  });
  return (
    <g className="sa-connection-line" data-status={connectionStatus ?? undefined}>
      <path className="react-flow__connection-path sa-connection-line__path" d={preview.path} fill="none" />
      <circle className="sa-connection-line__dot" cx={preview.end.x} cy={preview.end.y} r={3} />
    </g>
  );
}
