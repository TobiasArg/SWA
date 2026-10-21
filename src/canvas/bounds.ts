/**
 * Pure diagram-bounds math for PNG export (UI_V2_DESIGN.md section 9).
 * A cubic lies inside the convex hull of its control points, so the bbox of
 * the four control points (plus terminals, arrow tip and label plate) bounds
 * everything an edge draws.
 */
import type { Position, Rect } from "../domain/types";
import type { CubicEdgeGeometry } from "./floating";

export function pointsBounds(points: readonly Position[]): Rect | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function unionRects(rects: readonly (Rect | null | undefined)[]): Rect | null {
  let out: Rect | null = null;
  for (const r of rects) {
    if (!r) continue;
    if (!out) {
      out = { ...r };
      continue;
    }
    const x = Math.min(out.x, r.x);
    const y = Math.min(out.y, r.y);
    const right = Math.max(out.x + out.width, r.x + r.width);
    const bottom = Math.max(out.y + out.height, r.y + r.height);
    out = { x, y, width: right - x, height: bottom - y };
  }
  return out;
}

/** Bounding box of an edge: control points, terminal rings, arrow tip and the label plate (absolute coordinates). */
export function edgeBounds(geometry: CubicEdgeGeometry, labelPlate?: Rect | null): Rect {
  const r = geometry.terminalRadius;
  const pts: Position[] = [geometry.p0, geometry.p1, geometry.p2, geometry.p3];
  for (const c of [geometry.sourceTerminal, geometry.targetTerminal]) {
    pts.push({ x: c.x - r, y: c.y - r }, { x: c.x + r, y: c.y + r });
  }
  if (geometry.arrow) pts.push(geometry.arrow.tip);
  const box = pointsBounds(pts) as Rect;
  return unionRects([box, labelPlate]) as Rect;
}
