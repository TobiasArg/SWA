import { describe, expect, it } from "vitest";
import { edgeBounds, pointsBounds, unionRects } from "./bounds";
import { cubicEdgeGeometry } from "./floating";

const contains = (r: { x: number; y: number; width: number; height: number }, p: { x: number; y: number }) =>
  p.x >= r.x - 1e-9 && p.x <= r.x + r.width + 1e-9 && p.y >= r.y - 1e-9 && p.y <= r.y + r.height + 1e-9;

describe("bounds", () => {
  it("unionRects handles empties and unions", () => {
    expect(unionRects([])).toBeNull();
    expect(unionRects([null, undefined])).toBeNull();
    expect(unionRects([{ x: 0, y: 0, width: 10, height: 10 }, null, { x: -5, y: 5, width: 3, height: 20 }])).toEqual({
      x: -5,
      y: 0,
      width: 15,
      height: 25,
    });
  });

  it("pointsBounds", () => {
    expect(pointsBounds([])).toBeNull();
    expect(pointsBounds([{ x: 1, y: 2 }, { x: 4, y: -2 }])).toEqual({ x: 1, y: -2, width: 3, height: 4 });
  });

  it("edgeBounds contains every control point, terminal, arrow tip and the label plate", () => {
    const g = cubicEdgeGeometry({
      sourceAnchor: { x: 100, y: 25 },
      targetAnchor: { x: 100, y: 300 },
      sourceSide: "right",
      targetSide: "right",
      directed: true,
      parallelOffset: 40,
    });
    const plate = { x: g.labelX - 30, y: g.labelY - 10, width: 60, height: 20 };
    const b = edgeBounds(g, plate);
    for (const p of [g.p0, g.p1, g.p2, g.p3, g.arrow!.tip]) expect(contains(b, p)).toBe(true);
    for (const p of [
      { x: plate.x, y: plate.y },
      { x: plate.x + plate.width, y: plate.y + plate.height },
    ])
      expect(contains(b, p)).toBe(true);
    expect(contains(b, { x: g.sourceTerminal.x - g.terminalRadius, y: g.sourceTerminal.y - g.terminalRadius })).toBe(true);
    // Sampled curve points are inside the hull bbox.
    expect(b.x + b.width).toBeGreaterThan(g.p0.x);
  });

  it("works without a plate and for undirected edges", () => {
    const g = cubicEdgeGeometry({
      sourceAnchor: { x: 0, y: 0 },
      targetAnchor: { x: 0, y: 0 },
      sourceSide: "left",
      targetSide: "left",
      directed: false,
    });
    const b = edgeBounds(g);
    expect(Number.isFinite(b.width)).toBe(true);
    expect(contains(b, g.p1)).toBe(true);
  });
});
