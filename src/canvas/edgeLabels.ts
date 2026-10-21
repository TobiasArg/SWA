/**
 * Collision-aware relationship label layout (UI_V2_REFINEMENT.md section 3).
 *
 * Pure and deterministic: given the label requests (one per labelled edge) and
 * the obstacles (component boxes, group header strips, arrowheads, terminal
 * rings), every label is placed on its curve (one line), on its curve in two
 * lines, as a callout with a leader, or, as a guaranteed fallback, as a callout
 * stacked above everything it would cover. A label is never dropped.
 *
 * The canvas computes it once per render for all edges (CanvasView), and the
 * PNG export bounds use the same function with the same inputs.
 */
import { GROUP_HEADER } from "../domain/constants";
import type { Position, Rect } from "../domain/types";
import {
  cubicPoint,
  internalNodeRect,
  layoutRelationship,
  type CubicEdgeGeometry,
  type InternalNodeLike,
  type RelationshipLayout,
} from "./floating";
import { COMPONENT_NODE_TYPE, GROUP_NODE_TYPE, nodeComponent, type RelationshipEdgeData } from "./flowTypes";
import { ARROW_HALF_WIDTH, ARROW_LENGTH, shapeKindFor, type ShapeKind } from "./shapes";

// ---------------------------------------------------------------------------
// Constants and types (section 3.2)
// ---------------------------------------------------------------------------

export const LABEL_PAD_X = 6;
export const LABEL_PAD_Y = 2;
export const LABEL_LINE_HEIGHT = 15;
export const LABEL_CLEARANCE = 4;
/** Font size of `.react-flow__edge-text` (px). */
export const LABEL_FONT_SIZE = 12;
/** Fallback glyph width per code point where text cannot be measured (jsdom). */
export const LABEL_FALLBACK_CHAR_WIDTH = 7;

/** Stage A/B offsets along the curve, in canonical order. */
const T_OFFSETS = [0, 0.1, -0.1, 0.2, -0.2, 0.3, -0.3] as const;
const T_MIN = 0.2;
const T_MAX = 0.8;
/** Stage C radii: 12 + 12·j for j = 0…19. */
const CALLOUT_STEPS = 20;
const CALLOUT_BASE = 12;
const WRAP_SEPARATOR = " · ";

export interface LabelRequest {
  /** Relationship id. */
  id: string;
  /** relationshipCanvasLabel(rel) (already truncated). */
  text: string;
  /** P0..P3 after section 2.2 (canonical order for undirected). */
  curve: [Position, Position, Position, Position];
  /** labelPosition after section 2.2 step 0. */
  baseT: number;
  /** b̂ from section 2.2 step 4, or (0, -1) for short chords. */
  bowNormal: Position;
}

export interface LabelPlacement {
  mode: "path" | "path-wrapped" | "callout";
  lines: [string] | [string, string];
  /** Absolute, un-inflated plate rectangle. */
  plate: Rect;
  /** Callout only: from the curve point B(baseT) to the nearest point on the plate boundary. */
  leader: { from: Position; to: Position } | null;
}

/** CSS px width of `text` at the label font. */
export type MeasureText = (text: string) => number;

// ---------------------------------------------------------------------------
// Rect helpers
// ---------------------------------------------------------------------------

function inflate(rect: Rect, by: number): Rect {
  return { x: rect.x - by, y: rect.y - by, width: rect.width + 2 * by, height: rect.height + 2 * by };
}

/** Strict overlap: rectangles that only touch do not intersect. */
function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** True when the segment p→q passes through the open interior of `rect`. */
export function segmentCrossesRect(p: Position, q: Position, rect: Rect): boolean {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  let t0 = 0;
  let t1 = 1;
  const clip = (den: number, num: number): boolean => {
    // Liang–Barsky against the closed rectangle.
    if (den === 0) return num >= 0;
    const t = num / den;
    if (den < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  if (
    !clip(-dx, p.x - rect.x) ||
    !clip(dx, rect.x + rect.width - p.x) ||
    !clip(-dy, p.y - rect.y) ||
    !clip(dy, rect.y + rect.height - p.y)
  ) {
    return false;
  }
  if (t0 > t1) return false;
  // Inside the open interior: the middle of the clipped part is strictly inside.
  const tm = (t0 + t1) / 2;
  const mx = p.x + dx * tm;
  const my = p.y + dy * tm;
  return mx > rect.x && mx < rect.x + rect.width && my > rect.y && my < rect.y + rect.height;
}

/** Nearest point on the boundary of `rect` to `p`. */
export function nearestPointOnRectBoundary(p: Position, rect: Rect): Position {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const inside = p.x > rect.x && p.x < right && p.y > rect.y && p.y < bottom;
  if (!inside) {
    return { x: Math.min(right, Math.max(rect.x, p.x)), y: Math.min(bottom, Math.max(rect.y, p.y)) };
  }
  const dl = p.x - rect.x;
  const dr = right - p.x;
  const dt = p.y - rect.y;
  const db = bottom - p.y;
  const m = Math.min(dl, dr, dt, db);
  if (m === dt) return { x: p.x, y: rect.y };
  if (m === db) return { x: p.x, y: bottom };
  if (m === dl) return { x: rect.x, y: p.y };
  return { x: right, y: p.y };
}

/** Code-point order (independent of UTF-16 surrogate layout). */
function compareCodePoints(a: string, b: string): number {
  const ai = a[Symbol.iterator]();
  const bi = b[Symbol.iterator]();
  for (;;) {
    const x = ai.next();
    const y = bi.next();
    if (x.done || y.done) return x.done && y.done ? 0 : x.done ? -1 : 1;
    const cx = x.value.codePointAt(0)!;
    const cy = y.value.codePointAt(0)!;
    if (cx !== cy) return cx < cy ? -1 : 1;
  }
}

// ---------------------------------------------------------------------------
// Text splitting and plate sizing
// ---------------------------------------------------------------------------

/** Stage B split (section 3.3), or null when the text cannot be split. */
export function splitLabel(text: string): [string, string] | null {
  const sep = text.indexOf(WRAP_SEPARATOR);
  if (sep >= 0) return [`${text.slice(0, sep)} ·`, text.slice(sep + WRAP_SEPARATOR.length)];
  const chars = Array.from(text);
  const middle = Math.floor(chars.length / 2);
  let best = -1;
  let bestDistance = Infinity;
  chars.forEach((ch, index) => {
    if (ch !== " ") return;
    // Distance from the space to the middle code point; the earlier space wins a tie.
    const distance = Math.abs(index - middle);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  if (best < 0) return null;
  return [chars.slice(0, best).join(""), chars.slice(best + 1).join("")];
}

function plateSize(lines: readonly string[], measure: MeasureText): { width: number; height: number } {
  const textWidth = Math.ceil(Math.max(...lines.map((line) => measure(line))));
  return {
    width: textWidth + 2 * LABEL_PAD_X,
    height: LABEL_LINE_HEIGHT * lines.length + 2 * LABEL_PAD_Y,
  };
}

function centeredRect(center: Position, size: { width: number; height: number }): Rect {
  return { x: center.x - size.width / 2, y: center.y - size.height / 2, width: size.width, height: size.height };
}

function candidateTs(baseT: number): number[] {
  const out: number[] = [];
  for (const k of T_OFFSETS) {
    // Rounded so 0.5 + 0.1 and 0.7 - 0.1 compare equal after clamping.
    const t = Math.round(Math.min(T_MAX, Math.max(T_MIN, baseT + k)) * 1e9) / 1e9;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

function calloutDirections(bow: Position): Position[] {
  const raw: Position[] = [bow, { x: -bow.x, y: -bow.y }, { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];
  const out: Position[] = [];
  for (const v of raw) {
    const x = v.x === 0 ? 0 : v.x; // fold -0
    const y = v.y === 0 ? 0 : v.y;
    if (!out.some((u) => Math.abs(u.x - x) < 1e-12 && Math.abs(u.y - y) < 1e-12)) out.push({ x, y });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Layout (sections 3.2–3.3)
// ---------------------------------------------------------------------------

/**
 * Places every request's label. Requests are processed in ascending id order
 * (code points), so the result does not depend on array order.
 *
 * @param obstacles absolute, un-inflated (inflated by LABEL_CLEARANCE here).
 * @param nodeBoxes un-inflated component boxes a Stage C leader may not cross;
 *   defaults to `obstacles`.
 */
export function layoutEdgeLabels(
  requests: readonly LabelRequest[],
  obstacles: readonly Rect[],
  measure: MeasureText,
  nodeBoxes: readonly Rect[] = obstacles,
): Map<string, LabelPlacement> {
  const result = new Map<string, LabelPlacement>();
  const blocked: Rect[] = obstacles.map((rect) => inflate(rect, LABEL_CLEARANCE));
  const isFree = (plate: Rect) => !blocked.some((rect) => overlaps(plate, rect));
  const leaderClear = (from: Position, to: Position) => !nodeBoxes.some((rect) => segmentCrossesRect(from, to, rect));
  const place = (id: string, placement: LabelPlacement) => {
    result.set(id, placement);
    blocked.push(inflate(placement.plate, LABEL_CLEARANCE));
  };

  const ordered = [...requests].sort((a, b) => compareCodePoints(a.id, b.id));
  for (const request of ordered) {
    if (result.has(request.id) || request.text.length === 0) continue;
    const [p0, p1, p2, p3] = request.curve;
    const at = (t: number) => cubicPoint(p0, p1, p2, p3, t);
    const ts = candidateTs(request.baseT);

    // Stage A: on the path, one line.
    const oneLine = plateSize([request.text], measure);
    let placed = false;
    for (const t of ts) {
      const plate = centeredRect(at(t), oneLine);
      if (isFree(plate)) {
        place(request.id, { mode: "path", lines: [request.text], plate, leader: null });
        placed = true;
        break;
      }
    }
    if (placed) continue;

    // Stage B: on the path, two lines.
    const split = splitLabel(request.text);
    if (split) {
      const twoLines = plateSize(split, measure);
      for (const t of ts) {
        const plate = centeredRect(at(t), twoLines);
        if (isFree(plate)) {
          place(request.id, { mode: "path-wrapped", lines: split, plate, leader: null });
          placed = true;
          break;
        }
      }
    }
    if (placed) continue;

    // Stage C: callout with a leader.
    const q = at(request.baseT);
    const directions = calloutDirections(request.bowNormal);
    const { width: w, height: h } = oneLine;
    for (let j = 0; j < CALLOUT_STEPS && !placed; j++) {
      const r = CALLOUT_BASE + CALLOUT_BASE * j;
      for (const v of directions) {
        const distance = r + (Math.abs(v.x) * w) / 2 + (Math.abs(v.y) * h) / 2;
        const plate = centeredRect({ x: q.x + v.x * distance, y: q.y + v.y * distance }, oneLine);
        if (!isFree(plate)) continue;
        const to = nearestPointOnRectBoundary(q, plate);
        if (!leaderClear(q, to)) continue;
        place(request.id, { mode: "callout", lines: [request.text], plate, leader: { from: q, to } });
        placed = true;
        break;
      }
    }
    if (placed) continue;

    // Stage D: guaranteed fallback, moving strictly upward past whatever it covers.
    let plate = centeredRect({ x: q.x, y: q.y - (CALLOUT_BASE + h / 2) }, oneLine);
    for (let step = 0; step <= blocked.length; step++) {
      const hits = blocked.filter((rect) => overlaps(plate, rect));
      if (hits.length === 0) break;
      const bottom = Math.min(...hits.map((rect) => rect.y));
      plate = { ...plate, y: bottom - h };
    }
    place(request.id, {
      mode: "callout",
      lines: [request.text],
      plate,
      leader: { from: q, to: nearestPointOnRectBoundary(q, plate) },
    });
  }
  return result;
}

/** Everything a placement paints (plate plus leader end points), for export bounds. */
export function labelPlacementBounds(placement: LabelPlacement): Rect {
  const { plate, leader } = placement;
  if (!leader) return { ...plate };
  const xs = [plate.x, plate.x + plate.width, leader.from.x, leader.to.x];
  const ys = [plate.y, plate.y + plate.height, leader.from.y, leader.to.y];
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

// ---------------------------------------------------------------------------
// Obstacles and requests from diagram geometry
// ---------------------------------------------------------------------------

/** The edge geometry the label layout needs (a subset of CubicEdgeGeometry). */
export type LabelGeometry = Pick<
  CubicEdgeGeometry,
  "p0" | "p1" | "p2" | "p3" | "labelT" | "bowNormal" | "arrow" | "sourceTerminal" | "targetTerminal" | "terminalRadius"
>;

export interface EdgeLabelSource {
  id: string;
  /** Canvas label (already truncated); empty or missing means no label. */
  text: string | undefined;
  geometry: LabelGeometry;
}

export interface DiagramLabelInput {
  /** Absolute component node boxes. */
  componentRects: readonly Rect[];
  /** Absolute group boxes (only their header strips are obstacles). */
  groupRects: readonly Rect[];
  edges: readonly EdgeLabelSource[];
}

/** Arrowhead triangle bbox and both terminal ring boxes of one edge (obstacle class 3). */
export function edgeObstacles(geometry: LabelGeometry): Rect[] {
  const ring = geometry.terminalRadius + 0.75;
  const ringBox = (c: Position): Rect => ({ x: c.x - ring, y: c.y - ring, width: 2 * ring, height: 2 * ring });
  const out = [ringBox(geometry.sourceTerminal), ringBox(geometry.targetTerminal)];
  if (geometry.arrow) {
    const { tip, direction: u } = geometry.arrow;
    const base = { x: tip.x - u.x * ARROW_LENGTH, y: tip.y - u.y * ARROW_LENGTH };
    const n = { x: -u.y * ARROW_HALF_WIDTH, y: u.x * ARROW_HALF_WIDTH };
    const xs = [tip.x, base.x + n.x, base.x - n.x];
    const ys = [tip.y, base.y + n.y, base.y - n.y];
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    out.push({ x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y });
  }
  return out;
}

export function labelRequestFor(source: EdgeLabelSource): LabelRequest | null {
  if (!source.text) return null;
  const g = source.geometry;
  return { id: source.id, text: source.text, curve: [g.p0, g.p1, g.p2, g.p3], baseT: g.labelT, bowNormal: g.bowNormal };
}

/**
 * Lays out every label of a diagram: builds the obstacles of section 3.2
 * (component boxes, group header strips, arrowheads, terminal rings) and the
 * requests, then runs layoutEdgeLabels. Used by the canvas and the export bounds.
 */
export function layoutDiagramLabels(
  input: DiagramLabelInput,
  measure: MeasureText = measureLabelText,
): Map<string, LabelPlacement> {
  const obstacles: Rect[] = [...input.componentRects];
  for (const group of input.groupRects) {
    obstacles.push({ x: group.x, y: group.y, width: group.width, height: Math.min(GROUP_HEADER, group.height) });
  }
  const requests: LabelRequest[] = [];
  for (const edge of input.edges) {
    obstacles.push(...edgeObstacles(edge.geometry));
    const request = labelRequestFor(edge);
    if (request) requests.push(request);
  }
  return layoutEdgeLabels(requests, obstacles, measure, input.componentRects);
}

// ---------------------------------------------------------------------------
// React Flow adapters (pure; shared by the edge component, the canvas and export)
// ---------------------------------------------------------------------------

/** Structural subset of a React Flow internal node used here. */
export type FlowNodeLike = InternalNodeLike & { id: string; type?: string; data: object };

/** Structural subset of a relationship edge used here. */
export interface FlowEdgeLike {
  id: string;
  source: string;
  target: string;
  label?: unknown;
  markerEnd?: unknown;
  data?: RelationshipEdgeData;
}

/** Shape of a component node (ports sit on its silhouette); rounded for anything else. */
export function flowNodeShapeKind(node: { type?: string; data: object }): ShapeKind {
  const component = nodeComponent(node);
  return component ? shapeKindFor(component) : "rounded";
}

/**
 * The geometry RelationshipEdge draws for an edge. Arrowheads are driven by the
 * projection's `markerEnd` (set only for directed relationships).
 */
export function flowEdgeLayout(edge: FlowEdgeLike, sourceNode: FlowNodeLike, targetNode: FlowNodeLike): RelationshipLayout | null {
  const data = edge.data;
  if (!data) return null;
  const directed = data.relationship.direction === "directed" && Boolean(edge.markerEnd);
  return layoutRelationship({
    relationship: { ...data.relationship, direction: directed ? "directed" : "undirected" },
    sourceRect: internalNodeRect(sourceNode),
    targetRect: internalNodeRect(targetNode),
    sourceKind: flowNodeShapeKind(sourceNode),
    targetKind: flowNodeShapeKind(targetNode),
    parallelOffset: data.parallelOffset,
    labelPosition: data.labelPosition,
  });
}

/** Builds the layout input from React Flow internal nodes and edges. */
export function diagramLabelInputFromFlow(
  nodes: Iterable<FlowNodeLike>,
  edges: readonly FlowEdgeLike[],
  getNode: (id: string) => FlowNodeLike | undefined,
): DiagramLabelInput {
  const componentRects: Rect[] = [];
  const groupRects: Rect[] = [];
  for (const node of nodes) {
    if (node.type === COMPONENT_NODE_TYPE) componentRects.push(internalNodeRect(node));
    else if (node.type === GROUP_NODE_TYPE) groupRects.push(internalNodeRect(node));
  }
  const sources: EdgeLabelSource[] = [];
  for (const edge of edges) {
    const source = getNode(edge.source);
    const target = getNode(edge.target);
    if (!source || !target) continue;
    const geometry = flowEdgeLayout(edge, source, target);
    if (!geometry) continue;
    sources.push({ id: edge.id, text: typeof edge.label === "string" ? edge.label : undefined, geometry });
  }
  return { componentRects, groupRects, edges: sources };
}

// ---------------------------------------------------------------------------
// Measuring
// ---------------------------------------------------------------------------

/** 7 px per code point: conservative for a 12 px sans. */
export function fallbackMeasureText(text: string): number {
  return Array.from(text).length * LABEL_FALLBACK_CHAR_WIDTH;
}

let measureContext: CanvasRenderingContext2D | null | undefined;
const measureCache = new Map<string, number>();
const MEASURE_CACHE_LIMIT = 4000;

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (measureContext !== undefined) return measureContext;
  measureContext = null;
  if (typeof document === "undefined" || typeof navigator === "undefined" || /jsdom/i.test(navigator.userAgent)) {
    return measureContext;
  }
  try {
    const context = document.createElement("canvas").getContext("2d");
    if (context && typeof context.measureText === "function") {
      const family = getComputedStyle(document.documentElement).getPropertyValue("--sa-font-sans").trim() || "sans-serif";
      context.font = `400 ${LABEL_FONT_SIZE}px ${family}`;
      measureContext = context;
    }
  } catch {
    measureContext = null;
  }
  return measureContext;
}

/**
 * Label width at `400 12px var(--sa-font-sans)`, via a cached canvas
 * measureText; 7 px per code point where that is unavailable (jsdom).
 */
export function measureLabelText(text: string): number {
  const cached = measureCache.get(text);
  if (cached !== undefined) return cached;
  const context = getMeasureContext();
  const width = context ? context.measureText(text).width : fallbackMeasureText(text);
  if (measureCache.size >= MEASURE_CACHE_LIMIT) measureCache.clear();
  measureCache.set(text, width);
  return width;
}
