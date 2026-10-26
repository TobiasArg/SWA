import { describe, expect, it } from "vitest";
import {
  arrowheadGeometry,
  canonicalLabelPosition,
  canonicalOffset,
  computeParallelInfo,
  cubicEdgeGeometry,
  cubicPoint,
  internalNodeRect,
  layoutRelationship,
  connectionPreviewGeometry,
} from "./floating";
import {
  ARROW_LENGTH,
  CURVE_BOW_FACTOR,
  CURVE_BOW_MAX,
  CURVE_BOW_MIN_CHORD,
  DEPTH_DX,
  DEPTH_DY,
  TERMINAL_RADIUS,
  portNormal,
  type PortSide,
} from "./shapes";
import type { Position, Rect } from "../domain/types";
import { makeRelationship } from "./testing/fixtures";

describe("parallel edges", () => {
  it("steps offsets by PARALLEL_STEP (20 px) alternating sides", () => {
    expect([0, 1, 2, 3, 4].map(canonicalOffset)).toEqual([0, 20, -20, 40, -40]);
    expect([0, 1, 2].map(canonicalLabelPosition)).toEqual([0.5, 0.65, 0.35]);
  });

  it("is stable across pair ordering: opposite stored orders still land on distinct sides", () => {
    const rels = [
      makeRelationship({ id: "r1", sourceId: "a", targetId: "b" }),
      makeRelationship({ id: "r2", sourceId: "b", targetId: "a" }),
      makeRelationship({ id: "r3", sourceId: "a", targetId: "b" }),
      makeRelationship({ id: "r4", sourceId: "a", targetId: "c" }),
    ];
    const info = computeParallelInfo(rels);
    expect(info.get("r1")).toMatchObject({ parallelIndex: 0, parallelCount: 3, parallelOffset: 0 });
    // r2 is stored b→a: canonical +20 becomes -20 relative to its own direction.
    expect(info.get("r2")).toMatchObject({ parallelIndex: 1, parallelOffset: -20, labelPosition: 0.35 });
    expect(info.get("r3")).toMatchObject({ parallelIndex: 2, parallelOffset: -20, labelPosition: 0.35 });
    expect(info.get("r4")).toMatchObject({ parallelCount: 1, parallelOffset: 0 });

    // Rendered in absolute terms, r2 and r3 are on opposite sides of the a→b line.
    const ga = { x: 0, y: 0, width: 100, height: 50 };
    const gb = { x: 300, y: 0, width: 100, height: 50 };
    const layout = (source: typeof ga, target: typeof ga, id: string) =>
      layoutRelationship({
        relationship: { sourceId: id === "r2" ? "b" : "a", targetId: id === "r2" ? "a" : "b", direction: "undirected" },
        sourceRect: source,
        targetRect: target,
        sourceKind: "rounded",
        targetKind: "rounded",
        parallelOffset: info.get(id)!.parallelOffset,
        labelPosition: info.get(id)!.labelPosition,
      });
    const r2 = layout(gb, ga, "r2");
    const r3 = layout(ga, gb, "r3");
    expect(Math.sign(r2.p1.y - 25)).toBe(-Math.sign(r3.p1.y - 25));
    expect(r2.labelX).not.toBeCloseTo(r3.labelX);
  });
});

describe("internalNodeRect", () => {
  it("prefers measured size and falls back to fixed size", () => {
    expect(
      internalNodeRect({ internals: { positionAbsolute: { x: 5, y: 6 } }, measured: { width: 10, height: 20 }, width: 1 }),
    ).toEqual({ x: 5, y: 6, width: 10, height: 20 });
    expect(internalNodeRect({ internals: { positionAbsolute: { x: 0, y: 0 } }, width: 7, height: 8 })).toEqual({
      x: 0,
      y: 0,
      width: 7,
      height: 8,
    });
  });
});

describe("arrowheadGeometry (tip and direction)", () => {
  it("draws the triangle at the tip along the direction and reports the line end", () => {
    const arrow = arrowheadGeometry({ x: 10, y: 20 }, { x: 0, y: 1 });
    expect(arrow.path).toBe("M 10 20 L 5.5 10 L 14.5 10 Z");
    expect(arrow.lineEndX).toBeCloseTo(10);
    expect(arrow.lineEndY).toBeCloseTo(12);
  });
});

describe("cubicEdgeGeometry", () => {
  const base = {
    sourceAnchor: { x: 100, y: 25 },
    targetAnchor: { x: 400, y: 125 },
    sourceSide: "right" as const,
    targetSide: "left" as const,
  };

  it("directed: end tangent is -n_t, tip is TERMINAL_RADIUS + 0.75 from the anchor, curve ends 2px inside the head", () => {
    const g = cubicEdgeGeometry({ ...base, directed: true });
    // n_t = (-1, 0): tangent at the end = P3 - P2 points along (+1, 0) = -n_t.
    const tx = g.p3.x - g.p2.x;
    const ty = g.p3.y - g.p2.y;
    expect(ty).toBeCloseTo(0);
    expect(tx).toBeGreaterThan(0);
    expect(g.arrow).not.toBeNull();
    expect(g.arrow!.direction.x).toBe(1);
    expect(g.arrow!.direction.y).toBeCloseTo(0);
    expect(Math.hypot(g.arrow!.tip.x - 400, g.arrow!.tip.y - 125)).toBeCloseTo(TERMINAL_RADIUS + 0.75);
    expect(g.arrow!.tip.x).toBeCloseTo(400 - TERMINAL_RADIUS - 0.75);
    // P3 is arrow base + 2 px toward the node: tip - 8 along the node-facing axis.
    expect(g.p3.x).toBeCloseTo(g.arrow!.tip.x - 8);
    expect(g.p0).toEqual({ x: 100 + TERMINAL_RADIUS, y: 25 });
    expect(g.sourceTerminal).toEqual({ x: 100, y: 25 });
    expect(g.targetTerminal).toEqual({ x: 400, y: 125 });
  });

  it("undirected: no arrowhead and P3 on the terminal ring", () => {
    const g = cubicEdgeGeometry({ ...base, directed: false });
    expect(g.arrow).toBeNull();
    expect(g.p3).toEqual({ x: 400 - TERMINAL_RADIUS, y: 125 });
  });

  it("clamps the control distance to CURVE_MIN..CURVE_MAX", () => {
    const near = cubicEdgeGeometry({ ...base, targetAnchor: { x: 110, y: 25 }, directed: false });
    expect(near.p1.x - near.p0.x).toBeCloseTo(32);
    const far = cubicEdgeGeometry({ ...base, targetAnchor: { x: 2000, y: 25 }, directed: false });
    expect(far.p1.x - far.p0.x).toBeCloseTo(120);
    const mid = cubicEdgeGeometry({ ...base, targetAnchor: { x: 400, y: 25 }, directed: false });
    const chord = mid.p3.x - mid.p0.x;
    expect(mid.p1.x - mid.p0.x).toBeCloseTo(0.4 * chord);
  });

  it("parallel index 1 and 2 bulge to opposite sides of the chord", () => {
    const info = computeParallelInfo([
      makeRelationship({ id: "r1", sourceId: "a", targetId: "b" }),
      makeRelationship({ id: "r2", sourceId: "a", targetId: "b" }),
      makeRelationship({ id: "r3", sourceId: "a", targetId: "b" }),
    ]);
    const mk = (id: string) =>
      cubicEdgeGeometry({
        ...base,
        targetAnchor: { x: 400, y: 25 },
        directed: true,
        parallelOffset: info.get(id)!.parallelOffset,
        labelPosition: info.get(id)!.labelPosition,
      });
    const g0 = mk("r1");
    const g1 = mk("r2");
    const g2 = mk("r3");
    // Aligned facing ports: index 0 bows up by beta; the bow always pushes away from the
    // straight line on the side the parallel offset chose (UI_V2_REFINEMENT.md 2.2 step 6).
    const beta = 25 - g0.p1.y;
    expect(beta).toBeGreaterThan(0);
    // Left-hand normal of a rightward chord is -y.
    expect(g1.p1.y).toBeCloseTo(25 - 20 - beta);
    expect(g1.p2.y).toBeCloseTo(25 - 20 - beta);
    expect(g2.p1.y).toBeCloseTo(25 + 20 + beta);
    expect(g1.p0).toEqual(g2.p0);
  });

  it("label point equals B(labelPosition)", () => {
    const g = cubicEdgeGeometry({ ...base, directed: true, labelPosition: 0.65, parallelOffset: 20 });
    const p = cubicPoint(g.p0, g.p1, g.p2, g.p3, 0.65);
    expect(g.labelX).toBeCloseTo(p.x);
    expect(g.labelY).toBeCloseTo(p.y);
    expect(g.path.startsWith("M ")).toBe(true);
  });

  it("never throws and keeps the arrowhead for directed edges on coincident or overlapping anchors", () => {
    const same = { x: 50, y: 50 };
    const g = cubicEdgeGeometry({
      sourceAnchor: same,
      targetAnchor: same,
      sourceSide: "right",
      targetSide: "left",
      directed: true,
      parallelOffset: 20,
    });
    expect(g.arrow).not.toBeNull();
    expect(Number.isFinite(g.labelX) && Number.isFinite(g.labelY)).toBe(true);
    const u = cubicEdgeGeometry({ ...base, targetAnchor: { x: 101, y: 25 }, directed: false });
    expect(u.arrow).toBeNull();
    expect(u.path).not.toContain("NaN");
  });
});

describe("layoutRelationship", () => {
  const A = { x: 0, y: 0, width: 160, height: 80 };
  const B = { x: 400, y: 0, width: 160, height: 80 };
  const base = { sourceKind: "rounded", targetKind: "rounded" } as const;

  it("uses automatic sides (Rule A) without pins and follows the node when it moves", () => {
    const rel = { sourceId: "a", targetId: "b", direction: "directed" } as const;
    const right = layoutRelationship({ relationship: rel, sourceRect: A, targetRect: B, ...base });
    expect(right.sides).toEqual({ source: "right", target: "left" });
    const below = layoutRelationship({ relationship: rel, sourceRect: A, targetRect: { x: 0, y: 300, width: 160, height: 80 }, ...base });
    expect(below.sides).toEqual({ source: "bottom", target: "top" });
    expect(below.path).not.toBe(right.path);
  });

  it("pins win over automatic sides; a single pin uses Rule B for the other end", () => {
    const pinned = layoutRelationship({
      relationship: { sourceId: "a", targetId: "b", direction: "directed", visual: { ports: { source: "top", target: "bottom" } } },
      sourceRect: A,
      targetRect: B,
      ...base,
    });
    expect(pinned.sides).toEqual({ source: "top", target: "bottom" });
    const half = layoutRelationship({
      relationship: { sourceId: "a", targetId: "b", direction: "directed", visual: { ports: { source: "right" } } },
      sourceRect: A,
      targetRect: B,
      ...base,
    });
    expect(half.sides).toEqual({ source: "right", target: "left" });
    // Malformed pins are ignored (automatic).
    const bad = layoutRelationship({
      relationship: { sourceId: "a", targetId: "b", direction: "directed", visual: { ports: { source: "diagonal" } } },
      sourceRect: A,
      targetRect: B,
      ...base,
    });
    expect(bad.sides).toEqual({ source: "right", target: "left" });
  });

  it("renders an undirected relationship identically when its stored order is swapped (canonical order)", () => {
    const fwd = layoutRelationship({ relationship: { sourceId: "a", targetId: "b", direction: "undirected" }, sourceRect: A, targetRect: B, ...base, labelPosition: 0.5 });
    const rev = layoutRelationship({ relationship: { sourceId: "b", targetId: "a", direction: "undirected" }, sourceRect: B, targetRect: A, ...base, labelPosition: 0.5 });
    expect(rev.arrow).toBeNull();
    expect(fwd.arrow).toBeNull();
    expect(rev.path).toBe(fwd.path);
    expect(rev.p0).toEqual(fwd.p0);
    expect(rev.p3).toEqual(fwd.p3);
    expect(rev.labelX).toBe(fwd.labelX);
    expect(rev.labelY).toBe(fwd.labelY);
    expect(rev.sourceTerminal).toEqual(fwd.sourceTerminal);
    expect(rev.targetTerminal).toEqual(fwd.targetTerminal);
    expect(fwd.canonicalSwap).toBe(false);
    expect(rev.canonicalSwap).toBe(true);
  });

  it("draws an arrowhead only for directed relationships and always two terminals", () => {
    const directed = layoutRelationship({ relationship: { sourceId: "a", targetId: "b", direction: "directed" }, sourceRect: A, targetRect: B, ...base });
    const undirected = layoutRelationship({ relationship: { sourceId: "a", targetId: "b", direction: "undirected" }, sourceRect: A, targetRect: B, ...base });
    expect(directed.arrow).not.toBeNull();
    expect(undirected.arrow).toBeNull();
    for (const g of [directed, undirected]) {
      expect(g.sourceTerminal).toEqual({ x: 160 + DEPTH_DX, y: 40 }); // right port sits on the extruded outline
      expect(g.targetTerminal).toEqual({ x: 400, y: 40 });
    }
  });
});

describe("connectionPreviewGeometry", () => {
  const sourceAnchor = { x: 100, y: 50 };
  it("starts at the source anchor along its normal and ends at the pointer", () => {
    const g = connectionPreviewGeometry({ sourceAnchor, sourceSide: "right", pointer: { x: 300, y: 50 } });
    expect(g.end).toEqual({ x: 300, y: 50 });
    expect(g.path.startsWith("M 100 50 C 1")).toBe(true);
    const m = g.path.match(/C ([\d.-]+) ([\d.-]+)/)!;
    expect(Number(m[2])).toBe(50);
    expect(Number(m[1])).toBeGreaterThan(100);
  });

  it("snapped: ends at the port anchor and is the undirected cubic of the final edge (with the bow)", () => {
    const g = connectionPreviewGeometry({
      sourceAnchor,
      sourceSide: "right",
      pointer: { x: 290, y: 60 },
      snapped: { anchor: { x: 300, y: 50 }, side: "left" },
    });
    expect(g.end).toEqual({ x: 300, y: 50 });
    const expected = cubicEdgeGeometry({
      sourceAnchor,
      targetAnchor: { x: 300, y: 50 },
      sourceSide: "right",
      targetSide: "left",
      directed: false,
    });
    expect(g.path).toBe(expected.path);
    // Aligned facing ports: the preview is bowed (not straight).
    expect(expected.p1.y).toBeLessThan(50);
  });

  it("never throws on a zero-length drag", () => {
    expect(() => connectionPreviewGeometry({ sourceAnchor, sourceSide: "top", pointer: sourceAnchor })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// UI_V2_REFINEMENT.md section 2 / acceptance tests U1-U6
// ---------------------------------------------------------------------------

const AGENT_W = 220;
const AGENT_H = 88;
const SIDES: readonly PortSide[] = ["top", "right", "bottom", "left"];

const dist = (a: Position, b: Position): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Max perpendicular distance of B(t), 201 samples, from the line P0 -> P3. */
function maxDeviation(g: { p0: Position; p1: Position; p2: Position; p3: Position }): number {
  const dx = g.p3.x - g.p0.x;
  const dy = g.p3.y - g.p0.y;
  const len = Math.hypot(dx, dy);
  let max = 0;
  for (let i = 0; i <= 200; i++) {
    const p = cubicPoint(g.p0, g.p1, g.p2, g.p3, i / 200);
    const dev = len > 0 ? Math.abs((p.x - g.p0.x) * dy - (p.y - g.p0.y) * dx) / len : dist(p, g.p0);
    if (dev > max) max = dev;
  }
  return max;
}

const bowTarget = (chord: number): number => Math.min(CURVE_BOW_MAX, CURVE_BOW_FACTOR * chord);

/** Provisional end E of step 2 from a layout (terminal + normal * distance). */
function provisionalEnd(g: { targetTerminal: Position }, side: PortSide, directed: boolean): Position {
  const n = portNormal(side);
  const dd = directed ? TERMINAL_RADIUS + 0.75 + ARROW_LENGTH - 2 : TERMINAL_RADIUS;
  return { x: g.targetTerminal.x + n.x * dd, y: g.targetTerminal.y + n.y * dd };
}

function agentLayout(
  target: Position,
  direction: "directed" | "undirected",
  parallelOffset = 0,
  extra: { labelPosition?: number; swap?: boolean; ports?: { source?: PortSide; target?: PortSide } } = {},
) {
  const s: Rect = { x: 0, y: 0, width: AGENT_W, height: AGENT_H };
  const t: Rect = { x: target.x, y: target.y, width: AGENT_W, height: AGENT_H };
  const ports = extra.ports;
  const swapped = extra.swap === true;
  return layoutRelationship({
    relationship: {
      sourceId: swapped ? "b" : "a",
      targetId: swapped ? "a" : "b",
      direction,
      ...(ports
        ? { visual: { ports: swapped ? { source: ports.target, target: ports.source } : ports } }
        : {}),
    },
    sourceRect: swapped ? t : s,
    targetRect: swapped ? s : t,
    sourceKind: "rounded",
    targetKind: "rounded",
    parallelOffset,
    ...(extra.labelPosition === undefined ? {} : { labelPosition: extra.labelPosition }),
  });
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const near = (p: Position, x: number, y: number) => {
  expect(Math.abs(p.x - x)).toBeLessThanOrEqual(0.01);
  expect(Math.abs(p.y - y)).toBeLessThanOrEqual(0.01);
};

describe("bow worked numbers (refinement 2.5)", () => {
  const sa = { x: 320, y: 144 };
  const input = (tx: number, directed: boolean) => ({
    sourceAnchor: sa,
    targetAnchor: { x: tx, y: 144 },
    sourceSide: "right" as const,
    targetSide: "left" as const,
    directed,
  });

  it("directed, target at x = 400", () => {
    const g = cubicEdgeGeometry(input(400, true));
    near(g.p0, 323.5, 144);
    near(g.p1, 355.5, 134.36);
    near(g.p2, 355.75, 134.36);
    near(g.p3, 387.97, 142.13);
    expect(Math.abs(maxDeviation(g) - 6.53)).toBeLessThanOrEqual(0.01);
  });

  it("undirected, target at x = 400", () => {
    const g = cubicEdgeGeometry(input(400, false));
    near(g.p0, 323.5, 144);
    near(g.p1, 355.5, 133.05);
    near(g.p2, 364.5, 133.05);
    near(g.p3, 396.5, 144);
    expect(Math.abs(maxDeviation(g) - 8.21)).toBeLessThanOrEqual(0.01);
  });

  it("target at x = 700", () => {
    const u = cubicEdgeGeometry(input(700, false));
    near(u.p1, 443.5, 120);
    near(u.p2, 576.5, 120);
    expect(Math.abs(maxDeviation(u) - 18.0)).toBeLessThanOrEqual(0.01);
    const d = cubicEdgeGeometry(input(700, true));
    near(d.p3, 687.89, 142.53);
    expect(Math.abs(maxDeviation(d) - 17.45)).toBeLessThanOrEqual(0.01);
  });

  it("exposes bowNormal, labelT and canonicalSwap", () => {
    const g = cubicEdgeGeometry({ ...input(400, false), labelPosition: 0.65 });
    expect(g.bowNormal).toEqual({ x: 0, y: -1 });
    expect(g.labelT).toBe(0.65);
    expect(g.canonicalSwap).toBe(false);
    const swapped = cubicEdgeGeometry({ ...input(400, false), labelPosition: 0.65, sourceId: "z", targetId: "a" });
    expect(swapped.canonicalSwap).toBe(true);
    expect(swapped.labelT).toBeCloseTo(0.35);
    // Directed edges are never swapped.
    expect(cubicEdgeGeometry({ ...input(400, true), sourceId: "z", targetId: "a" }).canonicalSwap).toBe(false);
  });

  it("chords shorter than CURVE_BOW_MIN_CHORD get only the V2 parallel shift", () => {
    const g = cubicEdgeGeometry({
      sourceAnchor: { x: 0, y: 0 },
      targetAnchor: { x: 20, y: 0 },
      sourceSide: "right",
      targetSide: "left",
      directed: false,
      parallelOffset: 0,
    });
    expect(dist(g.p3, g.p0)).toBeLessThan(CURVE_BOW_MIN_CHORD);
    expect(g.p1.y).toBe(0);
    expect(g.p2.y).toBe(0);
    expect(g.bowNormal).toEqual({ x: 0, y: -1 });
    const shifted = cubicEdgeGeometry({
      sourceAnchor: { x: 0, y: 0 },
      targetAnchor: { x: 20, y: 0 },
      sourceSide: "right",
      targetSide: "left",
      directed: false,
      parallelOffset: 20,
    });
    expect(shifted.p1.y).toBeCloseTo(-20);
  });

  it("bow normal: horizontal-dominant bows up (45 degrees included), vertical-dominant bows right", () => {
    const mk = (tx: number, ty: number) =>
      cubicEdgeGeometry({
        sourceAnchor: { x: 0, y: 0 },
        targetAnchor: { x: tx, y: ty },
        sourceSide: "right",
        targetSide: "left",
        directed: false,
      }).bowNormal;
    expect(mk(300, 0).y).toBeLessThan(0);
    expect(mk(-300, 0).y).toBeLessThan(0);
    // Exact 45 degrees of the provisional chord: p0 = (R,0), E = (tx - R, ty).
    const k = 200;
    const b45 = mk(k + 2 * TERMINAL_RADIUS, k);
    expect(b45.y).toBeLessThan(0);
    const tall = mk(0, 300);
    expect(tall.x).toBeGreaterThan(0);
    expect(mk(0, -300).x).toBeGreaterThan(0);
  });
});

describe("U1 curvature, aligned facing", () => {
  it("every aligned facing case deviates >= 0.6 B", () => {
    const gaps = [40, 80, 300, 600];
    let cases = 0;
    for (const directed of [true, false]) {
      for (const gap of gaps) {
        const targets: Array<[PortSide, PortSide, Position]> = [
          // Gaps are measured between the extruded outlines: the right / bottom ports sit DEPTH_DX / DEPTH_DY outside the box.
          ["right", "left", { x: AGENT_W + DEPTH_DX + gap, y: 0 }],
          ["left", "right", { x: -AGENT_W - DEPTH_DX - gap, y: 0 }],
          ["bottom", "top", { x: 0, y: AGENT_H + DEPTH_DY + gap }],
          ["top", "bottom", { x: 0, y: -AGENT_H - DEPTH_DY - gap }],
        ];
        for (const [sSide, tSide, pos] of targets) {
          const g = agentLayout(pos, directed ? "directed" : "undirected");
          expect(g.sides).toEqual({ source: sSide, target: tSide });
          const e = provisionalEnd(g, tSide, directed);
          const chord = dist(g.p0, e);
          expect(maxDeviation(g)).toBeGreaterThanOrEqual(0.6 * bowTarget(chord) - 1e-9);
          cases++;
        }
      }
    }
    expect(cases).toBe(32);
  });
});

describe("U2 curvature, everywhere", () => {
  it("every non-overlapping placement with chord >= 24 deviates >= 0.25 B", () => {
    let worst = Infinity;
    let checked = 0;
    for (let x = -700; x <= 700; x += 10) {
      for (let y = -500; y <= 500; y += 10) {
        if (x > -AGENT_W && x < AGENT_W && y > -AGENT_H && y < AGENT_H) continue;
        for (const dir of ["directed", "undirected"] as const) {
          for (const off of [0, 20, -20, 40]) {
            const g = agentLayout({ x, y }, dir, off);
            const e = provisionalEnd(g, g.sides.target, dir === "directed");
            const chord = dist(g.p0, e);
            if (chord < CURVE_BOW_MIN_CHORD) continue;
            const ratio = maxDeviation(g) / bowTarget(chord);
            if (ratio < worst) worst = ratio;
            checked++;
            if (ratio < 0.25) throw new Error(`ratio ${ratio} at ${x},${y} ${dir} off ${off}`);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(50000);
    expect(worst).toBeGreaterThanOrEqual(0.25);
    console.info(`U2 worst ratio: ${worst.toFixed(4)} over ${checked} edges`);
  });
});

describe("U3 undirected swap", () => {
  it("swapping stored ends and pins gives identical path, terminals and label (parallel indexes 0-4)", () => {
    const placements: Position[] = [
      { x: 400, y: 0 },
      { x: 700, y: 0 },
      { x: 400, y: 120 },
      { x: -350, y: 260 },
      { x: 30, y: -300 },
      { x: 0, y: 200 },
    ];
    const pinSets: Array<{ source?: PortSide; target?: PortSide } | undefined> = [
      undefined,
      { source: "top", target: "bottom" },
      { source: "right" },
    ];
    for (const pos of placements) {
      for (const ports of pinSets) {
        for (let index = 0; index < 5; index++) {
          const t = canonicalLabelPosition(index);
          // Canonical (a -> b) info, and the same relationship stored as b -> a.
          const fwdOffset = canonicalOffset(index);
          const fwd = agentLayout(pos, "undirected", fwdOffset, { labelPosition: t, ...(ports ? { ports } : {}) });
          const rev = agentLayout(pos, "undirected", -fwdOffset, { labelPosition: 1 - t, swap: true, ...(ports ? { ports } : {}) });
          expect(rev.path).toBe(fwd.path);
          expect(rev.sourceTerminal).toEqual(fwd.sourceTerminal);
          expect(rev.targetTerminal).toEqual(fwd.targetTerminal);
          expect(rev.labelX).toBe(fwd.labelX);
          expect(rev.labelY).toBe(fwd.labelY);
          expect(rev.labelT).toBe(fwd.labelT);
          expect(rev.bowNormal).toEqual(fwd.bowNormal);
        }
      }
    }
  });
});

describe("U4 arrowhead", () => {
  const inside = (p: Position, r: Rect) => p.x > r.x && p.x < r.x + r.width && p.y > r.y && p.y < r.y + r.height;

  it("tip on the target ring, end tangent parallel to u, no triangle vertex strictly inside the target box", () => {
    let checked = 0;
    let flipped = 0;
    for (let x = -700; x <= 700; x += 10) {
      for (let y = -500; y <= 500; y += 10) {
        if (x > -AGENT_W && x < AGENT_W && y > -AGENT_H && y < AGENT_H) continue;
        // Skip boxes closer than the extrusion plus arrowhead clearance: the extruded volume (not the box) is what edges must clear.
        const gapX = Math.max(x - AGENT_W, -x - AGENT_W);
        const gapY = Math.max(y - AGENT_H, -y - AGENT_H);
        if (Math.max(gapX, gapY) < 3 * DEPTH_DY) continue;
        for (const off of [0, 20, -20, 40]) {
          const g = agentLayout({ x, y }, "directed", off);
          const arrow = g.arrow!;
          expect(arrow).not.toBeNull();
          expect(Math.abs(dist(arrow.tip, g.targetTerminal) - (TERMINAL_RADIUS + 0.75))).toBeLessThan(1e-9);
          const tx = g.p3.x - g.p2.x;
          const ty = g.p3.y - g.p2.y;
          const tl = Math.hypot(tx, ty);
          if (tl > 0) {
            const cross = (tx * arrow.direction.y - ty * arrow.direction.x) / tl;
            const dot = (tx * arrow.direction.x + ty * arrow.direction.y) / tl;
            // P3 lies on the segment P2 -> T, so the tangent is parallel to u. Only when P2 lies
            // within L - 2 of the tip (|T - P2| < 8) does P3 land behind P2 and the tangent flip sign.
            expect(Math.atan2(Math.abs(cross), Math.abs(dot))).toBeLessThan(1e-9);
            if (dot < 0) {
              flipped++;
              expect(Math.hypot(arrow.tip.x - g.p2.x, arrow.tip.y - g.p2.y)).toBeLessThan(ARROW_LENGTH - 2);
            }
          }
          const nums = arrow.path.match(/-?[\d.]+/g)!.map(Number);
          const box: Rect = { x, y, width: AGENT_W, height: AGENT_H };
          for (let i = 0; i < 6; i += 2) {
            expect(inside({ x: nums[i]!, y: nums[i + 1]! }, box)).toBe(false);
          }
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(10000);
    console.info(`U4 sign-flipped tangents (|T-P2| < 8): ${flipped} of ${checked}`);
  });

  it("an undirected edge never has an arrowhead, and the source end never has one", () => {
    expect(agentLayout({ x: 400, y: 0 }, "undirected").arrow).toBeNull();
    const g = agentLayout({ x: 400, y: 0 }, "directed");
    // The only triangle is at the target end.
    expect(dist(g.arrow!.tip, g.targetTerminal)).toBeLessThan(dist(g.arrow!.tip, g.sourceTerminal));
  });
});

describe("U5 parallel fan", () => {
  it("aligned facing ports: midpoints >= 15 px apart and no edge below 0.6 B", () => {
    for (const dir of ["directed", "undirected"] as const) {
      for (const gap of [80, 300, 480]) {
        const gs = [0, 1, 2, 3, 4].map((i) => agentLayout({ x: AGENT_W + DEPTH_DX + gap, y: 0 }, dir, canonicalOffset(i)));
        const mids = gs.map((g) => cubicPoint(g.p0, g.p1, g.p2, g.p3, 0.5));
        for (let i = 0; i < mids.length; i++) {
          for (let j = i + 1; j < mids.length; j++) {
            expect(dist(mids[i]!, mids[j]!)).toBeGreaterThanOrEqual(15 - 1e-9);
          }
          const e = provisionalEnd(gs[i]!, "left", dir === "directed");
          expect(maxDeviation(gs[i]!)).toBeGreaterThanOrEqual(0.6 * bowTarget(dist(gs[i]!.p0, e)) - 1e-9);
        }
      }
    }
  });

  it("matches the 2.3 worked midpoint ys for default Agents at x = 100 and 700 (undirected)", () => {
    const mk = (i: number) =>
      cubicEdgeGeometry({
        sourceAnchor: { x: 320, y: 144 },
        targetAnchor: { x: 700, y: 144 },
        sourceSide: "right",
        targetSide: "left",
        directed: false,
        parallelOffset: canonicalOffset(i),
      });
    const ys = [0, 1, 2, 3, 4].map((i) => {
      const g = mk(i);
      return Math.round(cubicPoint(g.p0, g.p1, g.p2, g.p3, 0.5).y);
    });
    expect(ys).toEqual([126, 111, 177, 96, 192]);
  });

  it("when the existing bend h >= B the controls equal V2's output", () => {
    // Offset facing sides with a big vertical difference: S bend already exceeds B.
    const input = {
      sourceAnchor: { x: 0, y: 0 },
      targetAnchor: { x: 300, y: 300 },
      sourceSide: "right" as const,
      targetSide: "left" as const,
      directed: false,
      parallelOffset: 20,
    };
    const g = cubicEdgeGeometry(input);
    const p0 = { x: TERMINAL_RADIUS, y: 0 };
    const p3 = { x: 300 - TERMINAL_RADIUS, y: 300 };
    const c = dist(p0, p3);
    const d = Math.min(120, Math.max(32, 0.4 * c));
    const sx = ((p3.y - p0.y) / c) * 20;
    const sy = (-(p3.x - p0.x) / c) * 20;
    // V2: P1 = P0 + n_s d + shift, P2 = P3 + n_t d + shift.
    near(g.p1, p0.x + d + sx, p0.y + sy);
    near(g.p2, p3.x - d + sx, p3.y + sy);
  });
});

describe("U6 continuity", () => {
  it("moving the target 1 px at a time through horizontal alignment changes P1/P2 by <= 2 px per step", () => {
    let maxStep = 0;
    for (const dx of [300, 600]) {
      for (const dir of ["directed", "undirected"] as const) {
        for (const off of [0, 20, -20]) {
          let prev: ReturnType<typeof agentLayout> | null = null;
          for (let dy = -40; dy <= 40; dy++) {
            const g = agentLayout({ x: dx, y: dy }, dir, off);
            expect(g.sides).toEqual({ source: "right", target: "left" });
            if (prev) {
              const step = Math.max(dist(prev.p1, g.p1), dist(prev.p2, g.p2));
              if (step > maxStep) maxStep = step;
              expect(step).toBeLessThanOrEqual(2);
            }
            prev = g;
          }
        }
      }
    }
    console.info(`U6 max step: ${maxStep.toFixed(3)} px`);
  });
});

describe("bow constants", () => {
  it("never throws on coincident anchors for any side pair", () => {
    for (const a of SIDES) {
      for (const b of SIDES) {
        for (const directed of [true, false]) {
          const g = cubicEdgeGeometry({
            sourceAnchor: { x: 5, y: 5 },
            targetAnchor: { x: 5, y: 5 },
            sourceSide: a,
            targetSide: b,
            directed,
            parallelOffset: 20,
            sourceId: "b",
            targetId: "a",
          });
          expect(g.path).not.toContain("NaN");
        }
      }
    }
    expect(round2(1.005)).toBeDefined();
  });
});
