import { createContext, useContext } from "react";
import type { ResizeParams } from "@xyflow/react";

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
