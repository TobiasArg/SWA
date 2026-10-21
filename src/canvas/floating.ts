/**
 * Pure geometry for floating relationship edges (TD 6.4).
 *
 * Endpoints are where the line between the two node centers leaves each node's
 * rectangle, so handles never determine the path. Parallel relationships between
 * the same pair are shifted perpendicular to the line in 12 px steps.
 */
import type { Position, Rect, Relationship } from "../domain/types";
import {
  ARROW_HALF_WIDTH,
  ARROW_LENGTH,
  CURVE_FACTOR,
  CURVE_MAX,
  CURVE_MIN,
  PARALLEL_STEP,
  TERMINAL_RADIUS,
  portNormal,
  type PortSide,
} from "./shapes";

export { PARALLEL_STEP };

export interface EdgeGeometry {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  /** Label anchor on the drawn segment (midpoint by default). */
  labelX: number;
  labelY: number;
}

export type ParallelInfo = {
  /** Position of this relationship among all relationships of the same unordered pair (array order). */
  parallelIndex: number;
  /** Number of relationships between the same unordered pair. */
  parallelCount: number;
  /**
   * Signed perpendicular offset in px, relative to this edge's own source → target
   * direction (positive = to the left of travel in screen coordinates). Signed so that
   * relationships stored in opposite orders still fan out to distinct sides.
   */
  parallelOffset: number;
  /**
   * Where the label sits along this edge's own source → target segment (0..1).
   * Parallel edges spread their labels along the line (0.5, 0.65, 0.35, …) so
   * labels of a pair do not overlap.
   */
  labelPosition: number;
};

export function rectCenter(rect: Rect): Position {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/** Index-based offset magnitude/side for the canonical pair direction: 0, +step, -step, +2*step, ..., … */
export function canonicalOffset(index: number): number {
  if (index <= 0) return 0;
  const step = Math.ceil(index / 2) * PARALLEL_STEP;
  return index % 2 === 1 ? step : -step;
}

export const LABEL_STEP = 0.15;

/** Label position along the canonical direction: 0.5, 0.65, 0.35, 0.8, 0.2 (clamped to 0.2..0.8). */
export function canonicalLabelPosition(index: number): number {
  if (index <= 0) return 0.5;
  const step = Math.ceil(index / 2) * LABEL_STEP;
  const position = index % 2 === 1 ? 0.5 + step : 0.5 - step;
  return Math.round(Math.min(0.8, Math.max(0.2, position)) * 1000) / 1000;
}

/**
 * Parallel-edge info for every relationship. The pair key is unordered, and the
 * side of the offset is defined against the canonical direction (lower id → higher
 * id), so results do not depend on which end each relationship stores as source.
 */
export function computeParallelInfo(relationships: readonly Relationship[]): Map<string, ParallelInfo> {
  const byPair = new Map<string, Relationship[]>();
  for (const rel of relationships) {
    const key = rel.sourceId < rel.targetId ? `${rel.sourceId}\u0000${rel.targetId}` : `${rel.targetId}\u0000${rel.sourceId}`;
    const list = byPair.get(key);
    if (list) list.push(rel);
    else byPair.set(key, [rel]);
  }

  const result = new Map<string, ParallelInfo>();
  for (const list of byPair.values()) {
    list.forEach((rel, index) => {
      const canonical = canonicalOffset(index);
      const sign = rel.sourceId < rel.targetId ? 1 : -1;
      const canonicalLabel = canonicalLabelPosition(index);
      result.set(rel.id, {
        parallelIndex: index,
        parallelCount: list.length,
        parallelOffset: canonical === 0 ? 0 : canonical * sign,
        labelPosition: sign === 1 ? canonicalLabel : 1 - canonicalLabel,
      });
    });
  }
  return result;
}

function clampPointToRect(point: Position, rect: Rect): Position {
  return {
    x: Math.min(rect.x + rect.width, Math.max(rect.x, point.x)),
    y: Math.min(rect.y + rect.height, Math.max(rect.y, point.y)),
  };
}

/**
 * The point where the ray from `from` (inside `rect`) toward `toward` leaves the
 * rectangle. Points outside the rectangle are clamped onto it first.
 */
export function rayExit(rect: Rect, from: Position, toward: Position): Position {
  const start = clampPointToRect(from, rect);
  const dx = toward.x - start.x;
  const dy = toward.y - start.y;
  if (dx === 0 && dy === 0) return start;

  let t = Number.POSITIVE_INFINITY;
  if (dx > 0) t = Math.min(t, (rect.x + rect.width - start.x) / dx);
  else if (dx < 0) t = Math.min(t, (rect.x - start.x) / dx);
  if (dy > 0) t = Math.min(t, (rect.y + rect.height - start.y) / dy);
  else if (dy < 0) t = Math.min(t, (rect.y - start.y) / dy);
  if (!Number.isFinite(t)) t = 0;

  return { x: start.x + dx * t, y: start.y + dy * t };
}

/**
 * Floating edge endpoints between two rectangles, with an optional perpendicular
 * offset (px) relative to the source → target direction.
 */
export function getFloatingEdgeGeometry(
  source: Rect,
  target: Rect,
  offset = 0,
  labelPosition = 0.5,
): EdgeGeometry {
  const sc = rectCenter(source);
  const tc = rectCenter(target);
  const dx = tc.x - sc.x;
  const dy = tc.y - sc.y;
  const length = Math.hypot(dx, dy);

  let shiftX = 0;
  let shiftY = 0;
  if (offset !== 0 && length > 0) {
    // Left-hand normal of the travel direction in screen coordinates (y down).
    shiftX = (dy / length) * offset;
    shiftY = (-dx / length) * offset;
  }

  const sFrom = { x: sc.x + shiftX, y: sc.y + shiftY };
  const tFrom = { x: tc.x + shiftX, y: tc.y + shiftY };
  const start = rayExit(source, sFrom, tFrom);
  const end = rayExit(target, tFrom, sFrom);

  return {
    sourceX: start.x,
    sourceY: start.y,
    targetX: end.x,
    targetY: end.y,
    labelX: start.x + (end.x - start.x) * labelPosition,
    labelY: start.y + (end.y - start.y) * labelPosition,
  };
}

/** Structural subset of React Flow's InternalNode that the edge geometry needs. */
export interface InternalNodeLike {
  internals: { positionAbsolute: Position };
  measured?: { width?: number; height?: number };
  width?: number;
  height?: number;
}

/** Absolute rectangle of a React Flow internal node (measured size, else fixed size). */
export function internalNodeRect(node: InternalNodeLike): Rect {
  return {
    x: node.internals.positionAbsolute.x,
    y: node.internals.positionAbsolute.y,
    width: node.measured?.width ?? node.width ?? 0,
    height: node.measured?.height ?? node.height ?? 0,
  };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface ArrowheadResult {
  path: string;
  lineEndX: number;
  lineEndY: number;
}

/**
 * Arrowhead triangle (tip at `tip`, pointing along unit `direction`) as an SVG
 * path, plus where the line should stop (2 px inside the head).
 */
export function arrowheadGeometry(
  tip: Position,
  direction: Position,
  length?: number,
  halfWidth?: number,
): ArrowheadResult;
/** @deprecated Straight-edge form kept for the v1 RelationshipEdge until S4. Returns null for short segments. */
export function arrowheadGeometry(geometry: EdgeGeometry, length?: number, halfWidth?: number): ArrowheadResult | null;
export function arrowheadGeometry(
  first: Position | EdgeGeometry,
  second?: Position | number,
  third?: number,
  fourth?: number,
): ArrowheadResult | null {
  if ("sourceX" in first) {
    const length = typeof second === "number" ? second : ARROW_LENGTH;
    const halfWidth = third ?? ARROW_HALF_WIDTH;
    const dx = first.targetX - first.sourceX;
    const dy = first.targetY - first.sourceY;
    const segment = Math.hypot(dx, dy);
    if (segment < length) return null;
    return arrowheadGeometry(
      { x: first.targetX, y: first.targetY },
      { x: dx / segment, y: dy / segment },
      length,
      halfWidth,
    );
  }
  const direction = second as Position;
  const length = third ?? ARROW_LENGTH;
  const halfWidth = fourth ?? ARROW_HALF_WIDTH;
  const mag = Math.hypot(direction.x, direction.y);
  const ux = mag > 0 ? direction.x / mag : 1;
  const uy = mag > 0 ? direction.y / mag : 0;
  const baseX = first.x - ux * length;
  const baseY = first.y - uy * length;
  const nx = -uy * halfWidth;
  const ny = ux * halfWidth;
  return {
    path: `M ${round2(first.x)} ${round2(first.y)} L ${round2(baseX + nx)} ${round2(baseY + ny)} L ${round2(baseX - nx)} ${round2(baseY - ny)} Z`,
    lineEndX: first.x - ux * (length - 2),
    lineEndY: first.y - uy * (length - 2),
  };
}

// ---------------------------------------------------------------------------
// Curved edges (UI_V2_DESIGN.md 8.5)
// ---------------------------------------------------------------------------

export interface CubicEdgeInput {
  /** Absolute port anchors on the silhouettes. */
  sourceAnchor: Position;
  targetAnchor: Position;
  sourceSide: PortSide;
  targetSide: PortSide;
  directed: boolean;
  /** Signed px along the left-hand normal of the chord P0 -> P3 (computeParallelInfo). */
  parallelOffset?: number;
  /** t in 0..1 for the label point (computeParallelInfo.labelPosition). */
  labelPosition?: number;
}

export interface CubicEdgeGeometry {
  p0: Position;
  p1: Position;
  p2: Position;
  p3: Position;
  /** `M P0 C P1 P2 P3` */
  path: string;
  /** Terminal ring centers (the anchors) and radius; drawn on both ends of every edge. */
  sourceTerminal: Position;
  targetTerminal: Position;
  terminalRadius: number;
  /** Directed only: arrow tip, unit direction (-n_t) and triangle path. Null when undirected. */
  arrow: { tip: Position; direction: Position; path: string } | null;
  /** Cubic point B(labelPosition). */
  labelX: number;
  labelY: number;
}

export function cubicPoint(p0: Position, p1: Position, p2: Position, p3: Position, t: number): Position {
  const m = 1 - t;
  const a = m * m * m;
  const b = 3 * m * m * t;
  const c = 3 * m * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/** Pure; never throws, including for coincident anchors. */
export function cubicEdgeGeometry(input: CubicEdgeInput): CubicEdgeGeometry {
  const { sourceAnchor: As, targetAnchor: At, directed } = input;
  const ns = portNormal(input.sourceSide);
  const nt = portNormal(input.targetSide);
  const t = Math.min(1, Math.max(0, input.labelPosition ?? 0.5));

  const p0 = { x: As.x + ns.x * TERMINAL_RADIUS, y: As.y + ns.y * TERMINAL_RADIUS };
  let p3: Position;
  let arrow: CubicEdgeGeometry["arrow"] = null;
  if (directed) {
    const tipDist = TERMINAL_RADIUS + 0.75;
    const tip = { x: At.x + nt.x * tipDist, y: At.y + nt.y * tipDist };
    const direction = { x: -nt.x, y: -nt.y };
    const head = arrowheadGeometry(tip, direction);
    arrow = { tip, direction, path: head.path };
    // 2 px inside the arrowhead base.
    p3 = { x: head.lineEndX, y: head.lineEndY };
  } else {
    p3 = { x: At.x + nt.x * TERMINAL_RADIUS, y: At.y + nt.y * TERMINAL_RADIUS };
  }

  const chordX = p3.x - p0.x;
  const chordY = p3.y - p0.y;
  const chord = Math.hypot(chordX, chordY);
  const d = Math.min(CURVE_MAX, Math.max(CURVE_MIN, CURVE_FACTOR * chord));
  let p1 = { x: p0.x + ns.x * d, y: p0.y + ns.y * d };
  let p2 = { x: p3.x + nt.x * d, y: p3.y + nt.y * d };

  const offset = input.parallelOffset ?? 0;
  if (offset !== 0 && chord > 0) {
    // Left-hand normal of travel in screen coordinates (y down).
    const sx = (chordY / chord) * offset;
    const sy = (-chordX / chord) * offset;
    p1 = { x: p1.x + sx, y: p1.y + sy };
    p2 = { x: p2.x + sx, y: p2.y + sy };
  }

  const label = cubicPoint(p0, p1, p2, p3, t);
  const f = round2;
  return {
    p0,
    p1,
    p2,
    p3,
    path: `M ${f(p0.x)} ${f(p0.y)} C ${f(p1.x)} ${f(p1.y)} ${f(p2.x)} ${f(p2.y)} ${f(p3.x)} ${f(p3.y)}`,
    sourceTerminal: { x: As.x, y: As.y },
    targetTerminal: { x: At.x, y: At.y },
    terminalRadius: TERMINAL_RADIUS,
    arrow,
    labelX: label.x,
    labelY: label.y,
  };
}
