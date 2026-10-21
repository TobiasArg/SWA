import { getStraightPath, type ConnectionLineComponentProps } from "@xyflow/react";
import type { CanvasNode } from "./flowTypes";

/**
 * Connection line while dragging from a handle (UI handoff 6): a dashed straight
 * line ending in a small dot. Its colour comes from canvas.css: accent by
 * default, danger while the canvas host reports an invalid target
 * (`data-connecting="invalid"`) or React Flow reports an invalid handle.
 */
export function ConnectionLine({ fromX, fromY, toX, toY, connectionStatus }: ConnectionLineComponentProps<CanvasNode>) {
  const [path] = getStraightPath({ sourceX: fromX, sourceY: fromY, targetX: toX, targetY: toY });
  return (
    <g className="sa-connection-line" data-status={connectionStatus ?? undefined}>
      <path className="react-flow__connection-path sa-connection-line__path" d={path} fill="none" />
      <circle className="sa-connection-line__dot" cx={toX} cy={toY} r={3} />
    </g>
  );
}
