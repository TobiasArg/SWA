import { describe, expect, it } from "vitest";
import {
  arrowheadGeometry,
  canonicalLabelPosition,
  canonicalOffset,
  computeParallelInfo,
  getFloatingEdgeGeometry,
  internalNodeRect,
  rayExit,
} from "./floating";
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
  it("steps offsets by 12 px alternating sides", () => {
    expect([0, 1, 2, 3, 4].map(canonicalOffset)).toEqual([0, 12, -12, 24, -24]);
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
    // r2 is stored b→a: canonical +12 becomes -12 relative to its own direction.
    expect(info.get("r2")).toMatchObject({ parallelIndex: 1, parallelOffset: -12, labelPosition: 0.35 });
    expect(info.get("r3")).toMatchObject({ parallelIndex: 2, parallelOffset: -12, labelPosition: 0.35 });
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
