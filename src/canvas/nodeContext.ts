import { createContext, useContext } from "react";
import type { ResizeParams } from "@xyflow/react";
import type { PortSide } from "../domain/ports";

/**
 * Callbacks that custom node components need from CanvasView. Provided by
 * CanvasView; the default is inert so nodes also render in isolation (tests).
 */
export interface CanvasNodeCallbacks {
  onResizeEnd: (nodeId: string, params: ResizeParams) => void;
}

const noop = () => {};

export const CanvasNodeCallbacksContext = createContext<CanvasNodeCallbacks>({ onResizeEnd: noop });

export function useCanvasNodeCallbacks(): CanvasNodeCallbacks {
  return useContext(CanvasNodeCallbacksContext);
}

/**
 * What the pointer is hovering during a connection drag (UI v2 7.1, 8.2): the
 * candidate target component and the port that would be used (the snapped port,
 * or the automatic choice for a body hover). Null/null when no drag is active.
 */
export interface ConnectHint {
  targetId: string | null;
  activeSide: PortSide | null;
}

export const NO_CONNECT_HINT: ConnectHint = { targetId: null, activeSide: null };

export const ConnectHintContext = createContext<ConnectHint>(NO_CONNECT_HINT);

export function useConnectHint(): ConnectHint {
  return useContext(ConnectHintContext);
}
