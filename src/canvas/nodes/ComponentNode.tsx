import { memo, useCallback } from "react";
import { Handle, NodeResizer, Position, type NodeProps, type OnResizeEnd } from "@xyflow/react";
import { MAX_SIZE, MIN_SIZE } from "../../domain/constants";
import type { Component } from "../../domain/types";
import { Icon, type IconName } from "../../ui/icons";
import type { ComponentFlowNode } from "../flowTypes";
import { componentTypeTag } from "../labels";
import { useCanvasNodeCallbacks } from "../nodeContext";

function iconFor(component: Component): IconName {
  switch (component.type) {
    case "agent":
      return component.subtype === "orchestrator" ? "orchestrator" : "agent";
    case "tool":
      return "tool";
    case "memory":
      return "memory";
    case "external_system":
      return "external";
    case "decision":
      return "decision";
  }
}

const HANDLES = [
  { id: "top", position: Position.Top },
  { id: "right", position: Position.Right },
  { id: "bottom", position: Position.Bottom },
  { id: "left", position: Position.Left },
] as const;

/**
 * A component node (UI handoff 5.1/5.2). The per-type treatment is selected in
 * canvas.css through `data-type` / `data-subtype`, derived from the domain type
 * (never from user-provided IDs, TD 3.4).
 *
 * Four `source` handles (connection mode is Loose) are always rendered so React
 * Flow can measure them; CSS shows them on hover, focus and selection.
 * NodeResizer is visible only while selected; the resize commit is the
 * `onResizeEnd` hook from CanvasView (see interactions.ts).
 */
function ComponentNodeView({ id, data, selected, isConnectable }: NodeProps<ComponentFlowNode>) {
  const { component } = data;
  const { onResizeEnd } = useCanvasNodeCallbacks();
  const handleResizeEnd = useCallback<OnResizeEnd>(
    (_event, params) => onResizeEnd(id, params),
    [id, onResizeEnd],
  );
  const description = component.description?.trim();

  return (
    <div
      className="sa-node"
      data-type={component.type}
      data-subtype={component.subtype}
      data-selected={selected ? "true" : undefined}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={MIN_SIZE.width}
        minHeight={MIN_SIZE.height}
        maxWidth={MAX_SIZE.width}
        maxHeight={MAX_SIZE.height}
        handleClassName="sa-resize-handle"
        lineClassName="sa-resize-line"
        onResizeEnd={handleResizeEnd}
      />
      <div className="sa-node__frame" aria-hidden="true" />
      <div className="sa-node__content">
        <div className="sa-node__type">
          <Icon name={iconFor(component)} size={16} className="sa-node__icon" />
          <span className="sa-node__type-label">{componentTypeTag(component)}</span>
        </div>
        <div className="sa-node__name">{component.name}</div>
        {description ? <div className="sa-node__description">{description}</div> : null}
      </div>
      {HANDLES.map((handle) => (
        <Handle
          key={handle.id}
          id={handle.id}
          type="source"
          position={handle.position}
          isConnectable={isConnectable}
          className="sa-handle"
        />
      ))}
    </div>
  );
}

export const ComponentNode = memo(ComponentNodeView);
