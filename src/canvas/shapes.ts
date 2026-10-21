/**
 * Pure node-silhouette geometry for UI v2 (UI_V2_DESIGN.md sections 2.2, 3, 8.3).
 *
 * All coordinates are box-local unless stated otherwise: (0, 0) is the top-left
 * of the node box and w x h is its effective size. Nothing here references
 * patterns, clipPaths or url(#...) so the output exports cleanly.
 */
import { DEFAULT_SIZE } from "../domain/constants";
import type { Component, Position, Rect } from "../domain/types";

import type { PortSide } from "../domain/ports";

export { PORT_SIDES, type PortSide } from "../domain/ports";

export type ShapeKind = "rounded" | "octagon" | "cylinder" | "parallelogram" | "hexagon";

export const NODE_STROKE = 1.5;
export const NODE_STROKE_HOVER = 2.25;
export const ORCHESTRATOR_STROKE = 2;
export const ROUNDED_RADIUS = 12;
export const OCTAGON_CHAMFER = 12;
export const PARALLELOGRAM_SKEW = 14;
export const HEXAGON_POINT = 20;
export const ORCHESTRATOR_BAND = 24;
export const SELECTION_INFLATE = 4;
export const PORT_RADIUS = 5;
export const PORT_HIT = 24;
export const TERMINAL_RADIUS = 3.5;
export const ARROW_LENGTH = 10;
export const ARROW_HALF_WIDTH = 4.5;
export const CURVE_MIN = 32;
export const CURVE_MAX = 120;
export const CURVE_FACTOR = 0.4;
export const PARALLEL_STEP = 20;
/** UI v2 refinement 2.1: largest minimum bow (px), perpendicular to the chord. */
export const CURVE_BOW_MAX = 24;
/** Bow target as a fraction of the chord length. */
export const CURVE_BOW_FACTOR = 0.15;
/** Below this chord length no bow is added (overlapping or touching nodes). */
export const CURVE_BOW_MIN_CHORD = 24;
export const CONNECTION_RADIUS = 20;
export const HATCH_STEP = 8;

/** Memory lid / base ellipse vertical radius: min(8, height / 7). */
export function cylinderCapRy(h: number): number {
  return Math.min(8, h / 7);
}

type TypeAndSubtype = Pick<Component, "type" | "subtype">;

export function isOrchestrator(component: TypeAndSubtype): boolean {
  return component.type === "agent" && component.subtype === "orchestrator";
}

export function shapeKindFor(component: Pick<Component, "type">): ShapeKind {
  switch (component.type) {
    case "agent":
      return "rounded";
    case "tool":
      return "octagon";
    case "memory":
      return "cylinder";
    case "external_system":
      return "parallelogram";
    case "decision":
      return "hexagon";
  }
}

const r2 = (n: number): number => {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
};

/**
 * SVG path `d` of the silhouette. `inflate` grows the outline evenly: the box
 * grows by `inflate` on every side, radius-type parameters (radius, chamfer, cap
 * ry) grow by `inflate`, and skew / point depth are scaled so slanted edges stay
 * parallel to the base outline.
 */
export function shapePath(kind: ShapeKind, w: number, h: number, inflate = 0): string {
  const i = inflate;
  const x0 = -i;
  const y0 = -i;
  const x1 = w + i;
  const y1 = h + i;
  const W = w + 2 * i;
  const H = h + 2 * i;
  switch (kind) {
    case "rounded": {
      const r = ROUNDED_RADIUS + i;
      return [
        `M${r2(x0 + r)},${r2(y0)}`,
        `H${r2(x1 - r)}`,
        `A${r2(r)},${r2(r)} 0 0 1 ${r2(x1)},${r2(y0 + r)}`,
        `V${r2(y1 - r)}`,
        `A${r2(r)},${r2(r)} 0 0 1 ${r2(x1 - r)},${r2(y1)}`,
        `H${r2(x0 + r)}`,
        `A${r2(r)},${r2(r)} 0 0 1 ${r2(x0)},${r2(y1 - r)}`,
        `V${r2(y0 + r)}`,
        `A${r2(r)},${r2(r)} 0 0 1 ${r2(x0 + r)},${r2(y0)}`,
        "Z",
      ].join(" ");
    }
    case "octagon": {
      const c = OCTAGON_CHAMFER + i;
      return [
        `M${r2(x0 + c)},${r2(y0)}`,
        `H${r2(x1 - c)}`,
        `L${r2(x1)},${r2(y0 + c)}`,
        `V${r2(y1 - c)}`,
        `L${r2(x1 - c)},${r2(y1)}`,
        `H${r2(x0 + c)}`,
        `L${r2(x0)},${r2(y1 - c)}`,
        `V${r2(y0 + c)}`,
        "Z",
      ].join(" ");
    }
    case "cylinder": {
      const ry = cylinderCapRy(h) + i;
      const rx = W / 2;
      return [
        `M${r2(x0)},${r2(y0 + ry)}`,
        `A${r2(rx)},${r2(ry)} 0 0 1 ${r2(x1)},${r2(y0 + ry)}`,
        `V${r2(y1 - ry)}`,
        `A${r2(rx)},${r2(ry)} 0 0 1 ${r2(x0)},${r2(y1 - ry)}`,
        "Z",
      ].join(" ");
    }
    case "parallelogram": {
      const s = h > 0 ? (PARALLELOGRAM_SKEW * H) / h : PARALLELOGRAM_SKEW;
      return [`M${r2(x0 + s)},${r2(y0)}`, `H${r2(x1)}`, `L${r2(x1 - s)},${r2(y1)}`, `H${r2(x0)}`, "Z"].join(" ");
    }
    case "hexagon": {
      const p = h > 0 ? (HEXAGON_POINT * H) / h : HEXAGON_POINT;
      const my = h / 2;
      return [
        `M${r2(x0 + p)},${r2(y0)}`,
        `H${r2(x1 - p)}`,
        `L${r2(x1)},${r2(my)}`,
        `L${r2(x1 - p)},${r2(y1)}`,
        `H${r2(x0 + p)}`,
        `L${r2(x0)},${r2(my)}`,
        "Z",
      ].join(" ");
    }
  }
}

/**
 * Type details drawn above the body path. Fixed order. `kind` lets the node
 * component style each differently:
 * - "band":  Orchestrator header band (filled with the type ink, never accented)
 * - "rim":   Memory lid rim (1 px stroke, node border color, no fill)
 * - "hatch": External System hatch (1 px stroke, hatch color, no fill)
 */
export type ShapeDetail = { kind: "band" | "rim" | "hatch"; d: string };

export function shapeDetails(component: TypeAndSubtype, w: number, h: number): ShapeDetail[] {
  if (isOrchestrator(component)) {
    const r = ROUNDED_RADIUS;
    return [
      {
        kind: "band",
        d: `M0,${ORCHESTRATOR_BAND} V${r} A${r},${r} 0 0 1 ${r},0 H${r2(w - r)} A${r},${r} 0 0 1 ${r2(w)},${r} V${ORCHESTRATOR_BAND} Z`,
      },
    ];
  }
  if (component.type === "memory") {
    const ry = r2(cylinderCapRy(h));
    return [{ kind: "rim", d: `M0,${ry} A${r2(w / 2)},${ry} 0 0 0 ${r2(w)},${ry}` }];
  }
  if (component.type === "external_system") {
    return [{ kind: "hatch", d: hatchSegments(w, h, HATCH_STEP) }];
  }
  return [];
}

/** Box-local port anchor, exactly on the silhouette outline. */
export function portAnchor(kind: ShapeKind, w: number, h: number, side: PortSide): Position {
  const s = kind === "parallelogram" ? PARALLELOGRAM_SKEW : 0;
  switch (side) {
    case "top":
      return { x: w / 2, y: 0 };
    case "bottom":
      return { x: w / 2, y: h };
    case "left":
      return { x: s / 2, y: h / 2 };
    case "right":
      return { x: w - s / 2, y: h / 2 };
  }
}

/** Outward unit normal of a port side (axis-aligned). */
export function portNormal(side: PortSide): Position {
  switch (side) {
    case "top":
      return { x: 0, y: -1 };
    case "right":
      return { x: 1, y: 0 };
    case "bottom":
      return { x: 0, y: 1 };
    case "left":
      return { x: -1, y: 0 };
  }
}

/** HTML content padding (px) per shape (section 3.3). */
export function contentInsets(component: Pick<Component, "type" | "subtype" | "size">): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  switch (component.type) {
    case "agent":
      return isOrchestrator(component)
        ? { top: 0, right: 12, bottom: 6, left: 12 }
        : { top: 10, right: 12, bottom: 8, left: 12 };
    case "tool":
      return { top: 10, right: 14, bottom: 8, left: 14 };
    case "memory": {
      const h = (component.size ?? DEFAULT_SIZE.memory).height;
      const ry = cylinderCapRy(h);
      return { top: 2 * ry + 4, right: 12, bottom: ry + 4, left: 12 };
    }
    case "external_system":
      return { top: 10, right: PARALLELOGRAM_SKEW + 12, bottom: 8, left: PARALLELOGRAM_SKEW + 12 };
    case "decision":
      return { top: 10, right: HEXAGON_POINT + 8, bottom: 8, left: HEXAGON_POINT + 8 };
  }
}

/**
 * 45 degree hatch (lines x + y = c, rising to the right) clipped mathematically
 * to the External parallelogram. Returns one path `d` of "M x y L x y" segments.
 */
export function hatchSegments(w: number, h: number, step: number): string {
  if (!(step > 0) || w <= 0 || h <= 0) return "";
  const s = PARALLELOGRAM_SKEW;
  // Clockwise (screen) vertices of the parallelogram.
  const poly: Position[] = [
    { x: s, y: 0 },
    { x: w, y: 0 },
    { x: w - s, y: h },
    { x: 0, y: h },
  ];
  const parts: string[] = [];
  const hi = Math.max(w, w - s + h); // max of x + y over vertices (min is s)
  for (let c = Math.floor(s / step) * step + step; c < hi; c += step) {
    // Line point (c, 0), direction (1, -1); parametrize by x.
    let t0 = -Infinity;
    let t1 = Infinity;
    let empty = false;
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k]!;
      const b = poly[(k + 1) % poly.length]!;
      // Inside when cross(b - a, p - a) >= 0 for clockwise-in-screen polygons.
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      // p(t) = (c + t, -t) - a
      const base = ex * (0 - a.y) - ey * (c - a.x);
      const slope = ex * -1 - ey * 1;
      if (Math.abs(slope) < 1e-12) {
        if (base < 0) empty = true;
      } else if (slope > 0) {
        t0 = Math.max(t0, -base / slope);
      } else {
        t1 = Math.min(t1, -base / slope);
      }
    }
    if (empty || !(t1 - t0 > 1)) continue;
    parts.push(`M${r2(c + t0)} ${r2(-t0)} L${r2(c + t1)} ${r2(-t1)}`);
  }
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Automatic ports (section 8.3)
// ---------------------------------------------------------------------------

export interface PortPair {
  source: PortSide;
  target: PortSide;
}

/** Rule A: both ends automatic. Pure, deterministic, swap-invariant physically. */
export function autoPorts(sourceRect: Rect, targetRect: Rect, sourceId: string, targetId: string): PortPair {
  const S = sourceRect;
  const T = targetRect;
  const gapX = Math.max(T.x - (S.x + S.width), S.x - (T.x + T.width));
  const gapY = Math.max(T.y - (S.y + S.height), S.y - (T.y + T.height));
  const dx = T.x + T.width / 2 - (S.x + S.width / 2);
  const dy = T.y + T.height / 2 - (S.y + S.height / 2);
  const canonicalForward = sourceId < targetId;
  if (gapX >= gapY) {
    const forward = dx > 0 || (dx === 0 && canonicalForward);
    return forward ? { source: "right", target: "left" } : { source: "left", target: "right" };
  }
  const forward = dy > 0 || (dy === 0 && canonicalForward);
  return forward ? { source: "bottom", target: "top" } : { source: "top", target: "bottom" };
}

const TIE_ORDER: readonly PortSide[] = ["right", "bottom", "left", "top"];

/** Absolute anchor of a port on a node placed at `rect`. */
export function absolutePortAnchor(kind: ShapeKind, rect: Rect, side: PortSide): Position {
  const a = portAnchor(kind, rect.width, rect.height, side);
  return { x: rect.x + a.x, y: rect.y + a.y };
}

/** Rule B: the side of `rect` whose anchor is nearest to `pinnedAnchor` (ties: right, bottom, left, top). */
export function autoPortFor(kind: ShapeKind, rect: Rect, pinnedAnchor: Position): PortSide {
  let best: PortSide = "right";
  let bestDist = Infinity;
  for (const side of TIE_ORDER) {
    const a = absolutePortAnchor(kind, rect, side);
    const d = Math.hypot(a.x - pinnedAnchor.x, a.y - pinnedAnchor.y);
    if (d < bestDist - 1e-9) {
      best = side;
      bestDist = d;
    }
  }
  return best;
}

export interface ResolvePortsInput {
  sourceRect: Rect;
  targetRect: Rect;
  sourceKind: ShapeKind;
  targetKind: ShapeKind;
  sourceId: string;
  targetId: string;
  /** Valid pins; either may be absent. */
  pins?: { source?: PortSide; target?: PortSide } | null;
}

/** Resolve both sides: pins win; one pin -> Rule B for the other; none -> Rule A. */
export function resolvePorts(input: ResolvePortsInput): PortPair {
  const sp = input.pins?.source;
  const tp = input.pins?.target;
  if (sp && tp) return { source: sp, target: tp };
  if (sp) {
    const anchor = absolutePortAnchor(input.sourceKind, input.sourceRect, sp);
    return { source: sp, target: autoPortFor(input.targetKind, input.targetRect, anchor) };
  }
  if (tp) {
    const anchor = absolutePortAnchor(input.targetKind, input.targetRect, tp);
    return { source: autoPortFor(input.sourceKind, input.sourceRect, anchor), target: tp };
  }
  return autoPorts(input.sourceRect, input.targetRect, input.sourceId, input.targetId);
}
