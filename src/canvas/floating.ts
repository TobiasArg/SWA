/**
 * Pure geometry for floating relationship edges (TD 6.4).
 *
 * Endpoints are where the line between the two node centers leaves each node's
 * rectangle, so handles never determine the path. Parallel relationships between
 * the same pair are shifted perpendicular to the line in 12 px steps.
 */
import type { Position, Rect, Relationship } from "../domain/types";

export const PARALLEL_STEP = 12;

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

/** Index-based offset magnitude/side for the canonical pair direction: 0, +12, -12, +24, -24, … */
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

/** Arrowhead triangle (tip at the target endpoint) as an SVG path, plus where the line should stop. */
export function arrowheadGeometry(
  geometry: EdgeGeometry,
  length = 10,
  halfWidth = 4.5,
): { path: string; lineEndX: number; lineEndY: number } | null {
  const dx = geometry.targetX - geometry.sourceX;
  const dy = geometry.targetY - geometry.sourceY;
  const segment = Math.hypot(dx, dy);
  if (segment < length) return null;
  const ux = dx / segment;
  const uy = dy / segment;
  const baseX = geometry.targetX - ux * length;
  const baseY = geometry.targetY - uy * length;
  const nx = -uy * halfWidth;
  const ny = ux * halfWidth;
  const f = (n: number) => Math.round(n * 100) / 100;
  return {
    path: `M ${f(geometry.targetX)} ${f(geometry.targetY)} L ${f(baseX + nx)} ${f(baseY + ny)} L ${f(baseX - nx)} ${f(baseY - ny)} Z`,
    // Stop the stroke slightly inside the arrowhead so it never pokes past the tip.
    lineEndX: geometry.targetX - ux * (length - 2),
    lineEndY: geometry.targetY - uy * (length - 2),
  };
}
