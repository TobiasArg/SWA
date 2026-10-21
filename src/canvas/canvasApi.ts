import { createContext, useContext } from "react";
import type { Position, Rect } from "../domain/types";
import { edgeBounds, unionRects } from "./bounds";
import type { CubicEdgeGeometry } from "./floating";

export interface CanvasApi {
  zoomIn(): void;
  zoomOut(): void;
  fitView(): void;
  screenToFlowPosition(position: Position): Position;
  getViewportElement(): HTMLElement | null;
  getNodesBounds(): Rect;
  /**
   * Everything the diagram draws: node bounds united with every edge's cubic
   * control points, terminals, arrowhead and label plate (UI v2 section 9).
   * Used by PNG export so curves that bulge beyond the nodes are not cropped.
   */
  getDiagramBounds(): Rect;
}

/** Edge label metrics used to estimate the label plate (SVG text, 12 px sans). */
export const LABEL_CHAR_WIDTH = 8;
export const LABEL_PLATE_PADDING_X = 6;
export const LABEL_PLATE_HEIGHT = 24;

/**
 * Deterministic, deliberately generous estimate of the label plate centered on
 * the label point: 8 px per character (wider than the real glyph average, so
 * the plate never under-estimates) plus the 6 px horizontal padding per side,
 * 24 px tall. Estimating (rather than measuring the DOM) keeps the function
 * pure, testable and independent of render timing. Empty label gives null.
 */
export function estimateLabelPlate(label: string | undefined, center: Position): Rect | null {
  const length = label ? Array.from(label).length : 0;
  if (length === 0) return null;
  const width = length * LABEL_CHAR_WIDTH + LABEL_PLATE_PADDING_X * 2;
  return { x: center.x - width / 2, y: center.y - LABEL_PLATE_HEIGHT / 2, width, height: LABEL_PLATE_HEIGHT };
}

/** Pure union of the node bounds with every edge's geometry bounds (control points, terminals, arrow, label plate). */
export function computeDiagramBounds(
  nodesBounds: Rect | null,
  edges: readonly { geometry: CubicEdgeGeometry; label?: string }[],
): Rect {
  const rects: (Rect | null)[] = [nodesBounds];
  for (const { geometry, label } of edges) {
    rects.push(edgeBounds(geometry, estimateLabelPlate(label, { x: geometry.labelX, y: geometry.labelY })));
  }
  return unionRects(rects) ?? { x: 0, y: 0, width: 0, height: 0 };
}

export const CanvasApiContext = createContext<CanvasApi | null>(null);

export function useCanvasApi(): CanvasApi {
  const api = useContext(CanvasApiContext);
  if (!api) {
    throw new Error("useCanvasApi must be used inside a CanvasApiContext provider.");
  }
  return api;
}
