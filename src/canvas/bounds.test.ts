import { describe, expect, it } from "vitest";
import type { Position, Rect } from "../domain/types";
import type { LabelPlacement } from "./edgeLabels";
import {
  type EdgeBoundsGeometry,
  computeDiagramBounds,
  cubicBounds,
  edgeBoundsRects,
  inflateRect,
  pointsBounds,
  unionRects,
} from "./bounds";
import { cubicPoint } from "./floating";

const contains = (r: Rect, p: Position) =>
  p.x >= r.x - 1e-9 && p.x <= r.x + r.width + 1e-9 && p.y >= r.y - 1e-9 && p.y <= r.y + r.height + 1e-9;

function geometry(overrides: Partial<EdgeBoundsGeometry> & Pick<EdgeBoundsGeometry, "p0" | "p1" | "p2" | "p3">): EdgeBoundsGeometry {
  return {
    arrow: null,
    sourceTerminal: overrides.p0,
    targetTerminal: overrides.p3,
    terminalRadius: 0,
    ...overrides,
  };
}

const close = (r: Rect, expected: Rect) => {
  expect(r.x).toBeCloseTo(expected.x, 9);
  expect(r.y).toBeCloseTo(expected.y, 9);
  expect(r.width).toBeCloseTo(expected.width, 9);
  expect(r.height).toBeCloseTo(expected.height, 9);
};

describe("bounds helpers", () => {
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

  it("inflateRect grows every side", () => {
    expect(inflateRect({ x: 10, y: 20, width: 30, height: 40 }, 1)).toEqual({ x: 9, y: 19, width: 32, height: 42 });
  });
});

describe("cubicBounds (exact extremes, UI v2 refinement 4.1)", () => {
  it("U9: a cubic whose x extreme lies strictly inside (0, 1) is bounded by the analytic extreme, not the control hull", () => {
    // x(t) = 3(1-t)^2 t * 100 + 3(1-t) t^2 * 100 peaks at t = 1/2 with x = 75; the control points reach 100.
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 100, y: 0 };
    const p2 = { x: 100, y: 100 };
    const p3 = { x: 0, y: 100 };
    const b = cubicBounds(p0, p1, p2, p3);
    close(b, { x: 0, y: 0, width: 75, height: 100 });
    expect(cubicPoint(p0, p1, p2, p3, 0.5).x).toBeCloseTo(75, 9);
    expect(b.width).toBeLessThan(100);
  });

  it("finds an interior extreme of the linear-derivative case (a = 0)", () => {
    // P0=0, P1=1, P2=0, P3=-3 on x: a = 0, b = -12, root t = 0.25, x(0.25) = 0.375 is the maximum.
    const b = cubicBounds({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }, { x: -3, y: 0 });
    close(b, { x: -3, y: 0, width: 3.375, height: 0 });
  });

  it("is tight: sampled curve points lie inside and the extremes are reached", () => {
    const p0 = { x: -40, y: 10 };
    const p1 = { x: 300, y: -120 };
    const p2 = { x: -200, y: 260 };
    const p3 = { x: 90, y: 30 };
    const b = cubicBounds(p0, p1, p2, p3);
    let minX = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i <= 4000; i += 1) {
      const p = cubicPoint(p0, p1, p2, p3, i / 4000);
      expect(contains(b, p)).toBe(true);
      minX = Math.min(minX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    expect(b.x).toBeCloseTo(minX, 3);
    expect(b.y + b.height).toBeCloseTo(maxY, 3);
  });
});

describe("edgeBoundsRects", () => {
  it("inflates the curve by 0.75 px and adds arrowhead vertices and both terminal rings (R + 0.75)", () => {
    const g = geometry({
      p0: { x: 0, y: 0 },
      p1: { x: 0, y: 0 },
      p2: { x: 40, y: 0 },
      p3: { x: 50, y: 0 },
      sourceTerminal: { x: 0, y: 0 },
      targetTerminal: { x: 50, y: 0 },
      terminalRadius: 6,
      arrow: { tip: { x: 50, y: 0 }, direction: { x: 1, y: 0 }, path: "" },
    });
    const rects = edgeBoundsRects(g);
    // Curve: x in [0, 50] (linear-ish), y == 0, inflated by 0.75.
    expect(rects[0]!.x).toBeCloseTo(-0.75, 9);
    expect(rects[0]!.width).toBeCloseTo(50 + 1.5, 9);
    // Arrowhead vertices: tip (50, 0), base corners (40, +-4.5).
    close(rects[1]!, { x: 40, y: -4.5, width: 10, height: 9 });
    // Terminal rings: 6.75 around each anchor.
    close(rects[2]!, { x: -6.75, y: -6.75, width: 13.5, height: 13.5 });
    close(rects[3]!, { x: 43.25, y: -6.75, width: 13.5, height: 13.5 });
  });

  it("has no arrowhead box for undirected edges", () => {
    const g = geometry({ p0: { x: 0, y: 0 }, p1: { x: 0, y: 10 }, p2: { x: 10, y: 10 }, p3: { x: 10, y: 0 } });
    expect(edgeBoundsRects(g)).toHaveLength(3);
  });
});

describe("computeDiagramBounds", () => {
  it("is a zero rect for nothing to draw", () => {
    expect(computeDiagramBounds({ nodeRects: [], edges: [], placements: [] })).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it("inflates every node box by 1 px, and includes groups as well as components", () => {
    const component = { x: 100, y: 100, width: 220, height: 88 };
    const group = { x: 60, y: 40, width: 400, height: 200 };
    const bounds = computeDiagramBounds({ nodeRects: [component, group], edges: [], placements: [] });
    close(bounds, { x: 59, y: 39, width: 402, height: 202 });
  });

  it("unites label plates and leader end points", () => {
    const placement: LabelPlacement = {
      mode: "callout",
      lines: ["delegates to · coordinates"],
      plate: { x: 300, y: 40, width: 160, height: 19 },
      leader: { from: { x: 360, y: 150 }, to: { x: 360, y: 59 } },
    };
    const bounds = computeDiagramBounds({ nodeRects: [], edges: [], placements: [placement] });
    close(bounds, { x: 300, y: 40, width: 160, height: 110 });
  });

  it("unites an edge's painted extent with the node boxes", () => {
    const curve = geometry({
      p0: { x: 0, y: 0 },
      p1: { x: 100, y: 0 },
      p2: { x: 100, y: 100 },
      p3: { x: 0, y: 100 },
      terminalRadius: 0,
    });
    // U9 at the diagram level: the extreme at x = 75 (+0.75), terminals/rings at the anchors (+0.75).
    const bounds = computeDiagramBounds({ nodeRects: [], edges: [{ geometry: curve }], placements: [] });
    close(bounds, { x: -0.75, y: -0.75, width: 76.5, height: 101.5 });
    expect(bounds.width).toBeLessThan(100 + 1.5);
  });
});
