/**
 * Pure diagram bounds for PNG export (UI_V2_REFINEMENT.md section 4.1): the
 * painted extents of the diagram, not a generous hull. The union of
 *
 *   1. every component box extended by the extrusion depth (right DEPTH_DX, bottom DEPTH_DY),
 *      and every group box, inflated by 1 px;
 *   2. every edge's exact cubic bounding box, inflated by 0.75 px;
 *   3. every arrowhead triangle (its three vertices) and both terminal rings (R + 0.75);
 *   4. every label plate and leader end point (section 3, after layout).
 */
import type { Position, Rect } from "../domain/types";
import type { LabelPlacement } from "./edgeLabels";
import { labelPlacementBounds } from "./edgeLabels";
import { cubicPoint, type CubicEdgeGeometry } from "./floating";
import { ARROW_HALF_WIDTH, ARROW_LENGTH, DEPTH_DX, DEPTH_DY } from "./shapes";

/** Half of the largest node outline stroke that reaches outside the node box (px). */
export const NODE_BOUNDS_INFLATE = 1;
/** Half of the 1.5 px edge stroke (px). */
export const EDGE_BOUNDS_INFLATE = 0.75;

/** The edge geometry the painted bounds need (a subset of CubicEdgeGeometry). */
export type EdgeBoundsGeometry = Pick<
  CubicEdgeGeometry,
  "p0" | "p1" | "p2" | "p3" | "arrow" | "sourceTerminal" | "targetTerminal" | "terminalRadius"
>;

export interface DiagramBoundsInput {
  /** Absolute boxes of every component node (not yet inflated or extended by the extrusion depth). */
  nodeRects: readonly Rect[];
  /** Absolute boxes of every group node (flat: no extrusion). */
  groupRects?: readonly Rect[];
  edges: readonly { geometry: EdgeBoundsGeometry }[];
  /** Label placements from layoutDiagramLabels (the same ones the canvas draws). */
  placements: Iterable<LabelPlacement>;
}

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

export function inflateRect(rect: Rect, amount: number): Rect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + 2 * amount,
    height: rect.height + 2 * amount,
  };
}

/** Exact bounding box of the cubic P0..P3: the curve at t = 0, 1 and at the interior roots of B'(t) per axis. */
export function cubicBounds(p0: Position, p1: Position, p2: Position, p3: Position): Rect {
  const points: Position[] = [p0, p3];
  const axis = (pick: (p: Position) => number): number[] => {
    const [v0, v1, v2, v3] = [pick(p0), pick(p1), pick(p2), pick(p3)];
    const a = 3 * (-v0 + 3 * v1 - 3 * v2 + v3);
    const b = 6 * (v0 - 2 * v1 + v2);
    const c = 3 * (v1 - v0);
    if (Math.abs(a) < 1e-9) {
      return Math.abs(b) < 1e-9 ? [] : [-c / b];
    }
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return [];
    const root = Math.sqrt(discriminant);
    return [(-b + root) / (2 * a), (-b - root) / (2 * a)];
  };
  const roots = new Set<number>([...axis((p) => p.x), ...axis((p) => p.y)]);
  for (const t of roots) {
    if (t > 0 && t < 1) points.push(cubicPoint(p0, p1, p2, p3, t));
  }
  return pointsBounds(points) as Rect;
}

/** The painted extent of one edge: curve, arrowhead vertices and both terminal rings (no label). */
export function edgeBoundsRects(geometry: EdgeBoundsGeometry): Rect[] {
  const rects: Rect[] = [inflateRect(cubicBounds(geometry.p0, geometry.p1, geometry.p2, geometry.p3), EDGE_BOUNDS_INFLATE)];
  if (geometry.arrow) {
    const { tip, direction: u } = geometry.arrow;
    const base = { x: tip.x - u.x * ARROW_LENGTH, y: tip.y - u.y * ARROW_LENGTH };
    const n = { x: -u.y * ARROW_HALF_WIDTH, y: u.x * ARROW_HALF_WIDTH };
    rects.push(pointsBounds([tip, { x: base.x + n.x, y: base.y + n.y }, { x: base.x - n.x, y: base.y - n.y }]) as Rect);
  }
  const ring = geometry.terminalRadius + EDGE_BOUNDS_INFLATE;
  for (const c of [geometry.sourceTerminal, geometry.targetTerminal]) {
    rects.push({ x: c.x - ring, y: c.y - ring, width: 2 * ring, height: 2 * ring });
  }
  return rects;
}

/** Union of everything the diagram paints, in flow coordinates (CSS px). Empty input gives a zero rect at the origin. */
export function computeDiagramBounds(input: DiagramBoundsInput): Rect {
  const rects: (Rect | null)[] = input.nodeRects.map((rect) =>
    inflateRect({ ...rect, width: rect.width + DEPTH_DX, height: rect.height + DEPTH_DY }, NODE_BOUNDS_INFLATE),
  );
  for (const rect of input.groupRects ?? []) rects.push(inflateRect(rect, NODE_BOUNDS_INFLATE));
  for (const { geometry } of input.edges) rects.push(...edgeBoundsRects(geometry));
  for (const placement of input.placements) rects.push(labelPlacementBounds(placement));
  return unionRects(rects) ?? { x: 0, y: 0, width: 0, height: 0 };
}
