import { memo, useCallback, type CSSProperties } from "react";
import { Handle, NodeResizer, Position, type NodeProps, type OnResizeEnd } from "@xyflow/react";
import { DEFAULT_SIZE, MAX_SIZE, MIN_SIZE, isAccentId } from "../../domain/constants";
import { effectivePaletteId } from "../../domain/palette";
import type { Component } from "../../domain/types";
import { Icon, type IconName } from "../../ui/icons";
import type { ComponentFlowNode } from "../flowTypes";
import { componentTypeTag } from "../labels";
import { useCanvasNodeCallbacks, useConnectHint } from "../nodeContext";
import {
  PORT_SIDES,
  SELECTION_INFLATE,
  contentInsets,
  extrusionPath,
  isOrchestrator,
  portAnchor,
  shapeDetails,
  shapeKindFor,
  shapePath,
  type PortSide,
} from "../shapes";

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

const HANDLE_POSITION: Record<PortSide, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

/**
 * A component node (UI v2 §3, §4, §7). The silhouette is one inline SVG built
 * from the pure geometry in shapes.ts, with no url(#...) references, filters or
 * blur so PNG export needs no ID resolution and 100+ nodes stay cheap. Layers,
 * bottom to top: a flat contact shadow (the extruded volume, offset by CSS), the
 * selection halo and outline (around the whole volume), the 2.5D volume
 * (`depth`: silhouette swept along DEPTH_DX / DEPTH_DY, whose visible part is the
 * side face), the top face (`body`, the unmoved silhouette) and the type details.
 * The depth is fixed: hover and selection only change shadow, stroke and color.
 * Color comes only from `data-palette`, the one effective palette entry
 * (UI_COLOR_CONFIRMATION_DESIGN §1.3); `data-type` and `data-subtype` select
 * geometry only. `data-accent` mirrors the stored choice for tests and is read
 * by no CSS rule. Both are only ever validated IDs, never user text (TD 3.4).
 *
 * Four `source` ports (connection mode is Loose) are always rendered so React
 * Flow can measure them. Each sits on the outline of the extruded volume at
 * `portAnchor(...)` (top / left on the top face, right / bottom on the outer
 * edge of the side face); CSS shows them on hover, focus, selection and while a connection is dragged.
 * NodeResizer is visible only while selected; the resize commit is the
 * `onResizeEnd` hook from CanvasView (see interactions.ts).
 */
function ComponentNodeView({ id, data, selected, isConnectable, width, height }: NodeProps<ComponentFlowNode>) {
  const { component } = data;
  const { onResizeEnd } = useCanvasNodeCallbacks();
  const hint = useConnectHint();
  const connectTarget = hint.targetId === id;
  const handleResizeEnd = useCallback<OnResizeEnd>(
    (_event, params) => onResizeEnd(id, params),
    [id, onResizeEnd],
  );
  const description = component.description?.trim();
  const fallback = component.size ?? DEFAULT_SIZE[component.type];
  const w = Math.max(0, width ?? fallback.width);
  const h = Math.max(0, height ?? fallback.height);
  const kind = shapeKindFor(component);
  const orchestrator = isOrchestrator(component);
  const accent = isAccentId(component.accent) ? component.accent : undefined;
  const insets = contentInsets({ ...component, size: { width: w, height: h } });
  const volume = extrusionPath(kind, w, h);
  const outline = extrusionPath(kind, w, h, SELECTION_INFLATE);
  const padding: CSSProperties = {
    paddingTop: insets.top,
    paddingRight: insets.right,
    paddingBottom: insets.bottom,
    paddingLeft: insets.left,
  };

  return (
    <div
      className="sa-node"
      data-type={component.type}
      data-subtype={component.subtype}
      data-accent={accent}
      data-palette={effectivePaletteId(component)}
      data-shape={kind}
      data-selected={selected ? "true" : undefined}
      data-connect-target={connectTarget ? "true" : undefined}
      style={padding}
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
      <svg
        className="sa-node__shape"
        width={w}
        height={h}
        overflow="visible"
        aria-hidden="true"
        focusable="false"
      >
        <path className="sa-node__shadow" d={volume} />
        <path className="sa-node__halo" d={outline} />
        <path className="sa-node__selection" d={outline} />
        <path className="sa-node__depth" d={volume} />
        <path className="sa-node__body" d={shapePath(kind, w, h)} />
        {shapeDetails(component, w, h).map((detail) => (
          <path
            key={detail.kind}
            className={`sa-node__detail sa-node__detail--${detail.kind}`}
            data-detail={detail.kind}
            d={detail.d}
          />
        ))}
      </svg>
      <div className="sa-node__content">
        <div className="sa-node__type">
          {orchestrator ? (
            <Icon name={iconFor(component)} size={16} className="sa-node__icon" />
          ) : (
            <span className="sa-node__chip">
              <Icon name={iconFor(component)} size={16} className="sa-node__icon" />
            </span>
          )}
          <span className="sa-node__type-label">{componentTypeTag(component)}</span>
        </div>
        <div className="sa-node__name">{component.name}</div>
        {description ? <div className="sa-node__description">{description}</div> : null}
      </div>
      {PORT_SIDES.map((side) => {
        const anchor = portAnchor(kind, w, h, side);
        return (
          <Handle
            key={side}
            id={side}
            type="source"
            position={HANDLE_POSITION[side]}
            isConnectable={isConnectable}
            className={connectTarget && hint.activeSide === side ? "sa-port sa-port--active" : "sa-port"}
            data-port={side}
            style={{ left: anchor.x, top: anchor.y }}
          />
        );
      })}
    </div>
  );
}

export const ComponentNode = memo(ComponentNodeView);
