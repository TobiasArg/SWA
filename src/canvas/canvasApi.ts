import { createContext, useContext } from "react";
import type { Position, Rect } from "../domain/types";

export interface CanvasApi {
  zoomIn(): void;
  zoomOut(): void;
  fitView(): void;
  screenToFlowPosition(position: Position): Position;
  getViewportElement(): HTMLElement | null;
  getNodesBounds(): Rect;
}

export const CanvasApiContext = createContext<CanvasApi | null>(null);

export function useCanvasApi(): CanvasApi {
  const api = useContext(CanvasApiContext);
  if (!api) {
    throw new Error("useCanvasApi must be used inside a CanvasApiContext provider.");
  }
  return api;
}
