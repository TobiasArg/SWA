import { describe, expect, it } from "vitest";
import {
  arrowheadGeometry,
  canonicalLabelPosition,
  canonicalOffset,
  computeParallelInfo,
  cubicEdgeGeometry,
  cubicPoint,
  getFloatingEdgeGeometry,
  internalNodeRect,
  rayExit,
} from "./floating";
import { TERMINAL_RADIUS } from "./shapes";
import { makeRelationship } from "./testing/fixtures";

const a = { x: 0, y: 0, width: 100, height: 50 };
const b = { x: 300, y: 0, width: 100, height: 50 };

describe("rayExit", () => {
  it("returns the border point in the direction of travel", () => {
    expect(rayExit(a, { x: 50, y: 25 }, { x: 350, y: 25 })).toEqual({ x: 100, y: 25 });
    expect(rayExit(a, { x: 50, y: 25 }, { x: 50, y: -100 })).toEqual({ x: 50, y: 0 });
  });

  it("hits corners on diagonals and handles a zero-length ray", () => {
    const square = { x: 0, y: 0, width: 100, height: 100 };
    expect(rayExit(square, { x: 50, y: 50 }, { x: 150, y: 150 })).toEqual({ x: 100, y: 100 });
    expect(rayExit(square, { x: 50, y: 50 }, { x: 50, y: 50 })).toEqual({ x: 50, y: 50 });
  });
});

describe("getFloatingEdgeGeometry", () => {
  it("puts endpoints on the facing borders and the label at the midpoint", () => {
    expect(getFloatingEdgeGeometry(a, b)).toEqual({
      sourceX: 100,
      sourceY: 25,
      targetX: 300,
      targetY: 25,
      labelX: 200,
      labelY: 25,
    });
  });

  it("shifts perpendicular to the line for parallel edges, keeping endpoints on borders", () => {
    const geometry = getFloatingEdgeGeometry(a, b, 12);
    // Left-hand normal of a rightward line in screen coordinates points up (-y).
    expect(geometry.sourceY).toBeCloseTo(13);
    expect(geometry.targetY).toBeCloseTo(13);
    expect(geometry.sourceX).toBeCloseTo(100);
    expect(geometry.targetX).toBeCloseTo(300);
  });

  it("places the label at the requested fraction", () => {
    expect(getFloatingEdgeGeometry(a, b, 0, 0.25).labelX).toBeCloseTo(150);
  });
});

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
    const r2 = getFloatingEdgeGeometry(gb, ga, info.get("r2")!.parallelOffset, info.get("r2")!.labelPosition);
    const r3 = getFloatingEdgeGeometry(ga, gb, info.get("r3")!.parallelOffset, info.get("r3")!.labelPosition);
    expect(Math.sign(r2.sourceY - 25)).toBe(-Math.sign(r3.sourceY - 25));
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

describe("arrowheadGeometry", () => {
  it("puts the tip at the target and shortens the line", () => {
    const arrow = arrowheadGeometry(getFloatingEdgeGeometry(a, b))!;
    expect(arrow.path.startsWith("M 300 25")).toBe(true);
    expect(arrow.lineEndX).toBeCloseTo(292);
  });

  it("returns null for segments shorter than the arrowhead", () => {
    expect(arrowheadGeometry({ sourceX: 0, sourceY: 0, targetX: 4, targetY: 0, labelX: 2, labelY: 0 })).toBeNull();
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
    expect(g0.p1.y).toBeCloseTo(25);
    // Left-hand normal of a rightward chord is -y.
    expect(g1.p1.y).toBeCloseTo(25 - 20);
    expect(g1.p2.y).toBeCloseTo(25 - 20);
    expect(g2.p1.y).toBeCloseTo(25 + 20);
    expect(g1.p0).toEqual(g2.p0);
    expect(g1.p3).toEqual(g2.p3);
    // Midpoint separation ~ 0.75 * offset.
    const mid1 = cubicPoint(g1.p0, g1.p1, g1.p2, g1.p3, 0.5);
    expect(25 - mid1.y).toBeCloseTo(15);
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
