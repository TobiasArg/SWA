/**
 * Pure geometry for relationship edges (UI_V2_DESIGN.md 8.5, TD 6.4): cubic
 * curves between port anchors on the node silhouettes, terminal rings, inline
 * arrowheads, and the parallel-relationship fan-out.
 */
import { readPortPins } from "../domain/ports";
import type { Position, Rect, Relationship } from "../domain/types";
import {
  ARROW_HALF_WIDTH,
  ARROW_LENGTH,
  CURVE_BOW_FACTOR,
  CURVE_BOW_MAX,
  CURVE_BOW_MIN_CHORD,
  CURVE_FACTOR,
  CURVE_MAX,
  CURVE_MIN,
  PARALLEL_STEP,
  TERMINAL_RADIUS,
  absolutePortAnchor,
  portNormal,
  resolvePorts,
  type PortPair,
  type PortSide,
  type ShapeKind,
} from "./shapes";

export { PARALLEL_STEP };

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
  length: number = ARROW_LENGTH,
  halfWidth: number = ARROW_HALF_WIDTH,
): ArrowheadResult {
  const mag = Math.hypot(direction.x, direction.y);
  const ux = mag > 0 ? direction.x / mag : 1;
  const uy = mag > 0 ? direction.y / mag : 0;
  const baseX = tip.x - ux * length;
  const baseY = tip.y - uy * length;
  const nx = -uy * halfWidth;
  const ny = ux * halfWidth;
  return {
    path: `M ${round2(tip.x)} ${round2(tip.y)} L ${round2(baseX + nx)} ${round2(baseY + ny)} L ${round2(baseX - nx)} ${round2(baseY - ny)} Z`,
    lineEndX: tip.x - ux * (length - 2),
    lineEndY: tip.y - uy * (length - 2),
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
  /** Signed px along the left-hand normal of the chord (computeParallelInfo), relative to the stored direction. */
  parallelOffset?: number;
  /** t in 0..1 for the label point (computeParallelInfo.labelPosition), relative to the stored direction. */
  labelPosition?: number;
  /**
   * Stored relationship ids. Only used for undirected edges: when both are given and
   * sourceId > targetId (code-point order) the geometry is built in canonical order
   * (UI_V2_REFINEMENT.md 2.2 step 0) so swapping the stored ends changes nothing.
   */
  sourceId?: string;
  targetId?: string;
}

export interface CubicEdgeGeometry {
  /** Canonical-order geometry for undirected edges (identical whatever the stored order). */
  p0: Position;
  p1: Position;
  p2: Position;
  p3: Position;
  /** `M P0 C P1 P2 P3` */
  path: string;
  /**
   * Terminal ring centers (the anchors) and radius; drawn on both ends of every edge.
   * For an undirected edge that was canonically swapped these are emitted in canonical
   * order (sourceTerminal = anchor at p0), so the pair is order-independent in output.
   */
  sourceTerminal: Position;
  targetTerminal: Position;
  terminalRadius: number;
  /** Directed only: arrow tip, unit direction of the curve end tangent and triangle path. Null when undirected. */
  arrow: { tip: Position; direction: Position; path: string } | null;
  /** Cubic point B(labelT). */
  labelX: number;
  labelY: number;
  /** Canonical label parameter actually used (1 - labelPosition after a swap). */
  labelT: number;
  /** Geometric bow normal b-hat (bows up for horizontal-dominant chords, else right); (0, -1) when the chord is shorter than CURVE_BOW_MIN_CHORD. */
  bowNormal: Position;
  /** True when step 0 swapped source and target (undirected, sourceId > targetId). */
  canonicalSwap: boolean;
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

/** Pure; never throws, including for coincident anchors. UI_V2_REFINEMENT.md 2.2 steps 0-9. */
export function cubicEdgeGeometry(input: CubicEdgeInput): CubicEdgeGeometry {
  const R = TERMINAL_RADIUS;
  // Step 0: canonical order for undirected edges, before any arithmetic.
  const canonicalSwap =
    !input.directed && input.sourceId !== undefined && input.targetId !== undefined && input.sourceId > input.targetId;
  const As = canonicalSwap ? input.targetAnchor : input.sourceAnchor;
  const At = canonicalSwap ? input.sourceAnchor : input.targetAnchor;
  const ns = portNormal(canonicalSwap ? input.targetSide : input.sourceSide);
  const nt = portNormal(canonicalSwap ? input.sourceSide : input.targetSide);
  const directed = input.directed;
  const rawOffset = input.parallelOffset ?? 0;
  const offset = canonicalSwap ? -rawOffset : rawOffset;
  const rawT = Math.min(1, Math.max(0, input.labelPosition ?? 0.5));
  // Rounded after a swap so 1 - (1 - t) reproduces t exactly (label placement is identical).
  const labelT = canonicalSwap ? Math.round((1 - rawT) * 1e6) / 1e6 : rawT;

  // Steps 1-3.
  const p0 = { x: As.x + ns.x * R, y: As.y + ns.y * R };
  const endDist = directed ? R + 0.75 + ARROW_LENGTH - 2 : R;
  const E = { x: At.x + nt.x * endDist, y: At.y + nt.y * endDist };
  const cx = E.x - p0.x;
  const cy = E.y - p0.y;
  const chord = Math.hypot(cx, cy);
  const d = Math.min(CURVE_MAX, Math.max(CURVE_MIN, CURVE_FACTOR * chord));
  const c1 = { x: p0.x + ns.x * d, y: p0.y + ns.y * d };
  const c2 = { x: E.x + nt.x * d, y: E.y + nt.y * d };

  // Steps 4-7.
  let bow: Position = { x: 0, y: -1 };
  let shiftX = 0;
  let shiftY = 0;
  if (chord >= CURVE_BOW_MIN_CHORD) {
    const ux = cx / chord;
    const uy = cy / chord;
    const px = -uy;
    const py = ux;
    if (Math.abs(ux) >= Math.abs(uy)) bow = py < 0 ? { x: px, y: py } : { x: -px, y: -py };
    else bow = px > 0 ? { x: px, y: py } : { x: -px, y: -py };
    const h = Math.max(
      Math.abs((c1.x - p0.x) * bow.x + (c1.y - p0.y) * bow.y),
      Math.abs((c2.x - p0.x) * bow.x + (c2.y - p0.y) * bow.y),
    );
    const B = Math.min(CURVE_BOW_MAX, CURVE_BOW_FACTOR * chord);
    const beta = Math.max(0, B - h);
    const pi = offset * ((cy / chord) * bow.x + (-cx / chord) * bow.y);
    const sigma = pi + (pi < 0 ? -1 : 1) * beta;
    shiftX = bow.x * sigma;
    shiftY = bow.y * sigma;
  } else if (offset !== 0 && chord > 0) {
    // V2 behavior: parallel shift only, along the left-hand normal of the chord.
    shiftX = (cy / chord) * offset;
    shiftY = (-cx / chord) * offset;
  }
  const p1 = { x: c1.x + shiftX, y: c1.y + shiftY };
  const p2 = { x: c2.x + shiftX, y: c2.y + shiftY };

  // Step 8.
  let p3: Position = E;
  let arrow: CubicEdgeGeometry["arrow"] = null;
  if (directed) {
    const tipDist = R + 0.75;
    const tip = { x: At.x + nt.x * tipDist, y: At.y + nt.y * tipDist };
    let ux = tip.x - p2.x;
    let uy = tip.y - p2.y;
    const m = Math.hypot(ux, uy);
    if (m > 0) {
      ux /= m;
      uy /= m;
    } else {
      ux = -nt.x;
      uy = -nt.y;
    }
    const direction = { x: ux, y: uy };
    const head = arrowheadGeometry(tip, direction);
    arrow = { tip, direction, path: head.path };
    p3 = { x: head.lineEndX, y: head.lineEndY };
  }

  const label = cubicPoint(p0, p1, p2, p3, labelT);
  const f = round2;
  return {
    p0,
    p1,
    p2,
    p3,
    path: `M ${f(p0.x)} ${f(p0.y)} C ${f(p1.x)} ${f(p1.y)} ${f(p2.x)} ${f(p2.y)} ${f(p3.x)} ${f(p3.y)}`,
    sourceTerminal: { x: As.x, y: As.y },
    targetTerminal: { x: At.x, y: At.y },
    terminalRadius: R,
    arrow,
    labelX: label.x,
    labelY: label.y,
    labelT,
    bowNormal: bow,
    canonicalSwap,
  };
}

// ---------------------------------------------------------------------------
// Connection preview (UI_V2_DESIGN.md 8.1)
// ---------------------------------------------------------------------------

export interface ConnectionPreviewInput {
  /** Absolute anchor of the pressed (source) port and its side. */
  sourceAnchor: Position;
  sourceSide: PortSide;
  /** Pointer in flow coordinates. */
  pointer: Position;
  /** When snapped to a port: that port's anchor and side. */
  snapped?: { anchor: Position; side: PortSide } | null;
}

export interface ConnectionPreviewGeometry {
  path: string;
  /** Where the end dot sits. */
  end: Position;
}

/**
 * Preview cubic from the source anchor along its normal. Snapped to a port: ends
 * at that anchor and arrives along its normal; otherwise the end tangent points
 * straight at the pointer (the direction of the chord). Pure, never throws.
 */
export function connectionPreviewGeometry(input: ConnectionPreviewInput): ConnectionPreviewGeometry {
  if (input.snapped) {
    // UI_V2_REFINEMENT.md 2.4: the same curve (bow included) the final edge will have, minus the arrowhead.
    const geometry = cubicEdgeGeometry({
      sourceAnchor: input.sourceAnchor,
      targetAnchor: input.snapped.anchor,
      sourceSide: input.sourceSide,
      targetSide: input.snapped.side,
      directed: false,
    });
    return { path: geometry.path, end: { x: input.snapped.anchor.x, y: input.snapped.anchor.y } };
  }
  const p0 = input.sourceAnchor;
  const ns = portNormal(input.sourceSide);
  const p3 = input.pointer;
  const chordX = p3.x - p0.x;
  const chordY = p3.y - p0.y;
  const chord = Math.hypot(chordX, chordY);
  const d = Math.min(CURVE_MAX, Math.max(CURVE_MIN, CURVE_FACTOR * chord));
  const p1 = { x: p0.x + ns.x * d, y: p0.y + ns.y * d };
  let p2: Position;
  if (chord > 0) {
    p2 = { x: p3.x - (chordX / chord) * d, y: p3.y - (chordY / chord) * d };
  } else {
    p2 = { x: p3.x, y: p3.y };
  }
  const f = round2;
  return {
    path: `M ${f(p0.x)} ${f(p0.y)} C ${f(p1.x)} ${f(p1.y)} ${f(p2.x)} ${f(p2.y)} ${f(p3.x)} ${f(p3.y)}`,
    end: { x: p3.x, y: p3.y },
  };
}

// ---------------------------------------------------------------------------
// Relationship layout (sides + cubic) from node rects
// ---------------------------------------------------------------------------

export interface RelationshipLayoutInput {
  relationship: Pick<Relationship, "sourceId" | "targetId" | "direction" | "visual">;
  sourceRect: Rect;
  targetRect: Rect;
  sourceKind: ShapeKind;
  targetKind: ShapeKind;
  parallelOffset?: number;
  labelPosition?: number;
}

export interface RelationshipLayout extends CubicEdgeGeometry {
  sides: PortPair;
}

/**
 * Resolves the sides (valid pins win, Rule B for a single pin, else Rule A) from
 * the actual node rects, then builds the cubic. Pure.
 */
export function layoutRelationship(input: RelationshipLayoutInput): RelationshipLayout {
  const { relationship } = input;
  const sides = resolvePorts({
    sourceRect: input.sourceRect,
    targetRect: input.targetRect,
    sourceKind: input.sourceKind,
    targetKind: input.targetKind,
    sourceId: relationship.sourceId,
    targetId: relationship.targetId,
    pins: readPortPins(relationship.visual),
  });
  const geometry = cubicEdgeGeometry({
    sourceAnchor: absolutePortAnchor(input.sourceKind, input.sourceRect, sides.source),
    targetAnchor: absolutePortAnchor(input.targetKind, input.targetRect, sides.target),
    sourceSide: sides.source,
    targetSide: sides.target,
    directed: relationship.direction === "directed",
    sourceId: relationship.sourceId,
    targetId: relationship.targetId,
    ...(input.parallelOffset === undefined ? {} : { parallelOffset: input.parallelOffset }),
    ...(input.labelPosition === undefined ? {} : { labelPosition: input.labelPosition }),
  });
  return { ...geometry, sides };
}
