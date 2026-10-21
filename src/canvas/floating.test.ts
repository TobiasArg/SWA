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
import { TERMINAL_RADIUS } from "./shapes";
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

  it("renders an undirected relationship identically when its stored order is swapped", () => {
    const fwd = layoutRelationship({ relationship: { sourceId: "a", targetId: "b", direction: "undirected" }, sourceRect: A, targetRect: B, ...base, labelPosition: 0.5 });
    const rev = layoutRelationship({ relationship: { sourceId: "b", targetId: "a", direction: "undirected" }, sourceRect: B, targetRect: A, ...base, labelPosition: 0.5 });
    expect(rev.arrow).toBeNull();
    expect(fwd.arrow).toBeNull();
    expect(rev.p0).toEqual(fwd.p3);
    expect(rev.p3).toEqual(fwd.p0);
    expect(rev.p1).toEqual(fwd.p2);
    expect(rev.p2).toEqual(fwd.p1);
    expect(rev.labelX).toBeCloseTo(fwd.labelX);
    expect(rev.labelY).toBeCloseTo(fwd.labelY);
    expect(rev.sourceTerminal).toEqual(fwd.targetTerminal);
  });

  it("draws an arrowhead only for directed relationships and always two terminals", () => {
    const directed = layoutRelationship({ relationship: { sourceId: "a", targetId: "b", direction: "directed" }, sourceRect: A, targetRect: B, ...base });
    const undirected = layoutRelationship({ relationship: { sourceId: "a", targetId: "b", direction: "undirected" }, sourceRect: A, targetRect: B, ...base });
    expect(directed.arrow).not.toBeNull();
    expect(undirected.arrow).toBeNull();
    for (const g of [directed, undirected]) {
      expect(g.sourceTerminal).toEqual({ x: 160, y: 40 });
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

  it("snapped: ends at the port anchor and arrives along its normal", () => {
    const g = connectionPreviewGeometry({
      sourceAnchor,
      sourceSide: "right",
      pointer: { x: 290, y: 60 },
      snapped: { anchor: { x: 300, y: 50 }, side: "left" },
    });
    expect(g.end).toEqual({ x: 300, y: 50 });
    const nums = g.path.match(/-?[\d.]+/g)!.map(Number);
    // P2 sits to the left of P3 on the target normal.
    expect(nums[4]).toBeLessThan(300);
    expect(nums[5]).toBe(50);
  });

  it("never throws on a zero-length drag", () => {
    expect(() => connectionPreviewGeometry({ sourceAnchor, sourceSide: "top", pointer: sourceAnchor })).not.toThrow();
  });
});
