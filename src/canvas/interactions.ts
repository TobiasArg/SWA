/**
 * Canvas gesture handlers that turn React Flow gestures into domain commands.
 *
 * - Drag (TD 6.5, `dragController.ts`): `onNodeDragStart` computes the moving set
 *   (dragged components + all members of dragged groups); `onNodeDrag` writes the
 *   transient positions of the whole moving set and the transient bounds of the
 *   affected groups into local node state, so members move live with their group
 *   and a member dragged outside grows its group live; `onNodeDragStop` dispatches
 *   ONE `moveElements` (one history step) or nothing for a zero delta.
 * - Resize: NodeResizer changes stay local (transient) during the gesture;
 *   `onResizeEnd` commits ONE `resizeComponent`. The store recomputes the bounds
 *   of the component's group.
 * - Connect (TD 6.3): while a connection is dragged, the element under the
 *   pointer decides whether the target is valid (another component) or invalid
 *   (pane, group, the source itself); the status drives the connection-line
 *   styling. Releasing over a valid target — on one of its handles or anywhere on
 *   its body — sets `pendingConnection`, which CanvasView renders as the
 *   RelationshipTypePicker. Escape during the drag cancels it.
 *
 * Every commit ends by re-syncing local node state from the projection, so a
 * rejected or no-op command never leaves the canvas showing an uncommitted state.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Connection,
  FinalConnectionState,
  OnConnectStartParams,
  OnNodeDrag,
  ResizeParams,
} from "@xyflow/react";
import { MAX_SIZE, MIN_SIZE } from "../domain/constants";
import { effectiveSize } from "../domain/geometry";
import type { Position } from "../domain/types";
import type { EditorStore } from "../editor/storeTypes";
import type { PortPins } from "../domain/ports";
import {
  capturePins,
  eventClientPoint,
  resolveConnectionTarget,
  type ConnectionStatus,
} from "./connection";
import {
  dragDelta,
  finalMoveCommand,
  startDrag,
  transientLayout,
  type DragSession,
  type TransientLayout,
} from "./dragController";
import type { CanvasNode } from "./flowTypes";
import { applyTransientLayout } from "./nodeState";

export interface PendingConnection {
  sourceId: string;
  targetId: string;
  /** Client coordinates of the release point; the picker is anchored here. */
  anchor: Position;
  /** Port pins captured by the gesture: source = pressed port, target only for a port release. */
  pins: PortPins;
}

/** `data-connecting` value on the canvas host while a connection is dragged. */
export type ConnectingState = ConnectionStatus | "cancelled" | null;

export interface CanvasInteractions {
  onNodeDragStart: OnNodeDrag<CanvasNode>;
  onNodeDrag: OnNodeDrag<CanvasNode>;
  onNodeDragStop: OnNodeDrag<CanvasNode>;
  onResizeEnd: (nodeId: string, params: ResizeParams) => void;
  onConnectStart: (event: MouseEvent | TouchEvent, params: OnConnectStartParams) => void;
  onConnect: (connection: Connection) => void;
  onConnectEnd: (event: MouseEvent | TouchEvent, state: FinalConnectionState) => void;
  connecting: ConnectingState;
  /** Component under the pointer while a connection is dragged (valid targets only). */
  connectTargetId: string | null;
  pendingConnection: PendingConnection | null;
  clearPendingConnection: () => void;
  /** Re-applies the active drag's transient layout (used when the projection changes mid-drag). */
  withActiveDrag: (nodes: CanvasNode[]) => CanvasNode[];
}

export interface CanvasInteractionOptions {
  store: EditorStore;
  /** Re-sync local React Flow node state from the domain projection. */
  resync: () => void;
  /** Updates local React Flow node state. */
  updateNodes: (updater: (nodes: CanvasNode[]) => CanvasNode[]) => void;
  /** Cancels React Flow's in-progress connection line. */
  cancelFlowConnection: () => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface ActiveConnection {
  sourceId: string;
  /** Handle (port side) the drag started from; always pinned. */
  sourceHandle: string | null;
  /** Handle the pointer was released on; absent for a body drop. */
  targetHandle: string | null;
  status: ConnectionStatus;
  targetId: string | null;
  cancelled: boolean;
}

export function useCanvasInteractions({
  store,
  resync,
  updateNodes,
  cancelFlowConnection,
}: CanvasInteractionOptions): CanvasInteractions {
  // ---- Drag -----------------------------------------------------------------
  const dragSession = useRef<DragSession | null>(null);
  const dragLayout = useRef<TransientLayout | null>(null);

  const onNodeDragStart = useCallback<OnNodeDrag<CanvasNode>>(
    (_event, node, draggedNodes) => {
      dragSession.current = startDrag(
        store.getState().architecture,
        node.id,
        draggedNodes.map((dragged) => dragged.id),
      );
      dragLayout.current = null;
    },
    [store],
  );

  const onNodeDrag = useCallback<OnNodeDrag<CanvasNode>>(
    (_event, node) => {
      const session = dragSession.current;
      if (!session || node.id !== session.primaryId) return;
      const layout = transientLayout(store.getState().architecture, session, dragDelta(session, node.position));
      dragLayout.current = layout;
      updateNodes((nodes) => applyTransientLayout(nodes, layout));
    },
    [store, updateNodes],
  );

  const onNodeDragStop = useCallback<OnNodeDrag<CanvasNode>>(
    (_event, node) => {
      const session = dragSession.current;
      dragSession.current = null;
      dragLayout.current = null;
      if (session && node.id === session.primaryId) {
        const command = finalMoveCommand(session, dragDelta(session, node.position));
        if (command) store.dispatch(command, { label: "Move" });
      }
      resync();
    },
    [resync, store],
  );

  const withActiveDrag = useCallback((nodes: CanvasNode[]) => {
    const layout = dragLayout.current;
    return layout ? applyTransientLayout(nodes, layout) : nodes;
  }, []);

  // ---- Resize ---------------------------------------------------------------
  const onResizeEnd = useCallback(
    (nodeId: string, params: ResizeParams) => {
      const component = store.getState().architecture.components.find((c) => c.id === nodeId);
      if (component) {
        const position = { x: Math.round(params.x), y: Math.round(params.y) };
        const size = {
          width: clamp(Math.round(params.width), MIN_SIZE.width, MAX_SIZE.width),
          height: clamp(Math.round(params.height), MIN_SIZE.height, MAX_SIZE.height),
        };
        const current = effectiveSize(component);
        const unchanged =
          component.position.x === position.x &&
          component.position.y === position.y &&
          current.width === size.width &&
          current.height === size.height;
        if (!unchanged) {
          store.dispatch({ kind: "resizeComponent", id: nodeId, position, size }, { label: "Resize component" });
        }
      }
      resync();
    },
    [resync, store],
  );

  // ---- Connect --------------------------------------------------------------
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  const [connecting, setConnecting] = useState<ConnectingState>(null);
  const [connectTargetId, setConnectTargetId] = useState<string | null>(null);
  const activeConnection = useRef<ActiveConnection | null>(null);
  const [listening, setListening] = useState(false);

  const updateStatus = useCallback(
    (point: Position | null) => {
      const active = activeConnection.current;
      if (!active || active.cancelled || !point) return;
      const componentIds = new Set(store.getState().architecture.components.map((c) => c.id));
      const target = resolveConnectionTarget(
        document.elementFromPoint(point.x, point.y),
        active.sourceId,
        componentIds,
      );
      active.status = target.status;
      active.targetId = target.targetId;
      setConnecting(target.status);
      setConnectTargetId(target.targetId);
    },
    [store],
  );

  // Pointer tracking and Escape handling while a connection is dragged.
  useEffect(() => {
    if (!listening) return;
    const onMove = (event: MouseEvent | TouchEvent) => updateStatus(eventClientPoint(event));
    const onKeyDown = (event: KeyboardEvent) => {
      const active = activeConnection.current;
      if (event.key !== "Escape" || !active || active.cancelled) return;
      // Cancel the connection only; the shell must not also clear the selection.
      event.preventDefault();
      event.stopPropagation();
      active.cancelled = true;
      setConnecting("cancelled");
      cancelFlowConnection();
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("touchmove", onMove);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("touchmove", onMove);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [cancelFlowConnection, listening, updateStatus]);

  const onConnectStart = useCallback((_event: MouseEvent | TouchEvent, params: OnConnectStartParams) => {
    if (!params.nodeId) return;
    activeConnection.current = {
      sourceId: params.nodeId,
      sourceHandle: params.handleId,
      targetHandle: null,
      status: "invalid",
      targetId: null,
      cancelled: false,
    };
    setPendingConnection(null);
    setConnectTargetId(null);
    setConnecting("invalid");
    setListening(true);
  }, []);

  // React Flow calls this (before onConnectEnd) only when released on a valid handle.
  const onConnect = useCallback((connection: Connection) => {
    const active = activeConnection.current;
    if (!active || active.cancelled) return;
    if (connection.source === active.sourceId && connection.target && connection.target !== active.sourceId) {
      active.status = "valid";
      active.targetId = connection.target;
      // Released on (or snapped to) a port: pin it. A body drop never reaches here.
      active.targetHandle = connection.targetHandle ?? null;
    }
  }, []);

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      const point = eventClientPoint(event);
      const active = activeConnection.current;
      setListening(false);
      if (active && !active.cancelled && point) {
        // Releasing on another component's body (not only a handle) also connects.
        if (active.status !== "valid") updateStatus(point);
      }
      activeConnection.current = null;
      if (active && !active.cancelled && point && active.status === "valid" && active.targetId) {
        setPendingConnection({
          sourceId: active.sourceId,
          targetId: active.targetId,
          anchor: point,
          pins: capturePins(active.sourceHandle, active.targetHandle),
        });
      }
      setConnecting(null);
      setConnectTargetId(null);
    },
    [updateStatus],
  );

  const clearPendingConnection = useCallback(() => setPendingConnection(null), []);

  return {
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
    onResizeEnd,
    onConnectStart,
    onConnect,
    onConnectEnd,
    connecting,
    connectTargetId,
    pendingConnection,
    clearPendingConnection,
    withActiveDrag,
  };
}
