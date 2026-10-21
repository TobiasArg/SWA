import { createContext, useContext } from "react";
import type { Position, Rect } from "../domain/types";

export interface CanvasApi {
  zoomIn(): void;
  zoomOut(): void;
  fitView(): void;
  screenToFlowPosition(position: Position): Position;
  getViewportElement(): HTMLElement | null;
  getNodesBounds(): Rect;
  /**
   * Everything the diagram paints, in flow coordinates: node and group boxes,
   * exact edge curves, arrowheads, terminal rings and label plates (UI v2
   * refinement section 4.1). Used by PNG export; it is computed from the same
   * label layout the canvas draws, so the export matches the screen.
   */
  getDiagramBounds(): Rect;
}

export const CanvasApiContext = createContext<CanvasApi | null>(null);

export function useCanvasApi(): CanvasApi {
  const api = useContext(CanvasApiContext);
  if (!api) {
    throw new Error("useCanvasApi must be used inside a CanvasApiContext provider.");
  }
  return api;
}
