import { describe, expect, it } from "vitest";
import { DEFAULT_SIZE, MAX_SIZE, MIN_SIZE } from "../domain/constants";
import type { ComponentType, Position, Rect } from "../domain/types";
import {
  CURVE_BOW_FACTOR,
  CURVE_BOW_MAX,
  CURVE_BOW_MIN_CHORD,
  CURVE_FACTOR,
  OCTAGON_CHAMFER,
  PARALLELOGRAM_SKEW,
  PARALLEL_STEP,
  PORT_SIDES,
  autoPortFor,
  autoPorts,
  contentInsets,
  cylinderCapRy,
  hatchSegments,
  portAnchor,
  portNormal,
  resolvePorts,
  shapeDetails,
  shapeKindFor,
  shapePath,
  type PortSide,
  type ShapeKind,
} from "./shapes";

describe("constants", () => {
  it("match section 2.2", () => {
    expect(PARALLEL_STEP).toBe(20);
    expect(CURVE_FACTOR).toBe(0.4);
    expect(CURVE_BOW_MAX).toBe(24);
    expect(CURVE_BOW_FACTOR).toBe(0.15);
    expect(CURVE_BOW_MIN_CHORD).toBe(24);
    expect(cylinderCapRy(56)).toBe(8);
    expect(cylinderCapRy(35)).toBe(5);
    expect(PORT_SIDES).toEqual(["top", "right", "bottom", "left"]);
  });
});

describe("shapeKindFor", () => {
  it.each<[ComponentType, ShapeKind]>([
    ["agent", "rounded"],
    ["tool", "octagon"],
    ["memory", "cylinder"],
    ["external_system", "parallelogram"],
    ["decision", "hexagon"],
  ])("%s -> %s", (type, kind) => {
    expect(shapeKindFor({ type })).toBe(kind);
  });
});

// --- outline distance helpers (independent of the portAnchor implementation) ---

type Seg = [Position, Position];

function segDist(p: Position, [a, b]: Seg): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Flatten an absolute-command path (M H V L A Z) into dense segments. */
function flatten(d: string): Seg[] {
  const tokens = d.match(/[MHVLAZ]|-?\d*\.?\d+/g)!;
  const segs: Seg[] = [];
  let i = 0;
  let cur: Position = { x: 0, y: 0 };
  let start: Position = cur;
  const num = () => Number(tokens[i++]);
  const push = (to: Position) => {
    segs.push([cur, to]);
    cur = to;
  };
  while (i < tokens.length) {
    const cmd = tokens[i++]!;
    if (cmd === "M") {
      cur = { x: num(), y: num() };
      start = cur;
    } else if (cmd === "H") push({ x: num(), y: cur.y });
    else if (cmd === "V") push({ x: cur.x, y: num() });
    else if (cmd === "L") push({ x: num(), y: num() });
    else if (cmd === "Z") push(start);
    else if (cmd === "A") {
      const rx = num();
      const ry = num();
      num();
      num();
      const sweep = num();
      const to = { x: num(), y: num() };
      const k = rx / ry;
      const P = { x: cur.x, y: cur.y * k };
      const Q = { x: to.x, y: to.y * k };
      const mx = (P.x + Q.x) / 2;
      const my = (P.y + Q.y) / 2;
      const half = Math.hypot(Q.x - P.x, Q.y - P.y) / 2;
      const h = Math.sqrt(Math.max(0, rx * rx - half * half));
      const ux = (Q.x - P.x) / (2 * half);
      const uy = (Q.y - P.y) / (2 * half);
      const cands = [
        { x: mx - uy * h, y: my + ux * h },
        { x: mx + uy * h, y: my - ux * h },
      ];
      let c = cands[0]!;
      for (const cand of cands) {
        const cross = (P.x - cand.x) * (Q.y - cand.y) - (P.y - cand.y) * (Q.x - cand.x);
        if (sweep === 1 ? cross >= -1e-9 : cross <= 1e-9) {
          c = cand;
          break;
        }
      }
      const a0 = Math.atan2(P.y - c.y, P.x - c.x);
      let a1 = Math.atan2(Q.y - c.y, Q.x - c.x);
      if (sweep === 1) while (a1 <= a0 + 1e-9) a1 += 2 * Math.PI;
      else while (a1 >= a0 - 1e-9) a1 -= 2 * Math.PI;
      let prev = cur;
      const N = 400;
      for (let s = 1; s <= N; s++) {
        const a = a0 + ((a1 - a0) * s) / N;
        const pt = { x: c.x + rx * Math.cos(a), y: (c.y + rx * Math.sin(a)) / k };
        segs.push([prev, pt]);
        prev = pt;
      }
      cur = to;
    }
  }
  return segs;
}

function outlineDistance(p: Position, segs: Seg[]): number {
  return Math.min(...segs.map((s) => segDist(p, s)));
}

const KINDS: ShapeKind[] = ["rounded", "octagon", "cylinder", "parallelogram", "hexagon"];
const SIZES: [string, number, number][] = [
  ["MIN", MIN_SIZE.width, MIN_SIZE.height],
  ["agent default", DEFAULT_SIZE.agent.width, DEFAULT_SIZE.agent.height],
  ["tool default", DEFAULT_SIZE.tool.width, DEFAULT_SIZE.tool.height],
  ["memory default", DEFAULT_SIZE.memory.width, DEFAULT_SIZE.memory.height],
  ["external default", DEFAULT_SIZE.external_system.width, DEFAULT_SIZE.external_system.height],
  ["decision default", DEFAULT_SIZE.decision.width, DEFAULT_SIZE.decision.height],
  ["MAX", MAX_SIZE.width, MAX_SIZE.height],
];

describe("portAnchor", () => {
  for (const kind of KINDS) {
    for (const [label, w, h] of SIZES) {
      it(`${kind} @ ${label} ${w}x${h}: every side lies on the outline within 0.5 px`, () => {
        const segs = flatten(shapePath(kind, w, h));
        for (const side of PORT_SIDES) {
          expect(outlineDistance(portAnchor(kind, w, h, side), segs)).toBeLessThan(0.5);
        }
      });
    }
  }

  it("matches the section 3.2 anchor table", () => {
    expect(portAnchor("rounded", 200, 80, "right")).toEqual({ x: 200, y: 40 });
    expect(portAnchor("parallelogram", 200, 80, "left")).toEqual({ x: PARALLELOGRAM_SKEW / 2, y: 40 });
    expect(portAnchor("parallelogram", 200, 80, "right")).toEqual({ x: 200 - PARALLELOGRAM_SKEW / 2, y: 40 });
    expect(portAnchor("cylinder", 200, 80, "top")).toEqual({ x: 100, y: 0 });
  });

  it("portNormal is a unit axis vector per side", () => {
    expect(portNormal("top")).toEqual({ x: 0, y: -1 });
    expect(portNormal("right")).toEqual({ x: 1, y: 0 });
    expect(portNormal("bottom")).toEqual({ x: 0, y: 1 });
    expect(portNormal("left")).toEqual({ x: -1, y: 0 });
  });
});

describe("shapePath", () => {
  it("produces the spec path for the rounded rectangle", () => {
    expect(shapePath("rounded", 100, 50)).toBe(
      "M12,0 H88 A12,12 0 0 1 100,12 V38 A12,12 0 0 1 88,50 H12 A12,12 0 0 1 0,38 V12 A12,12 0 0 1 12,0 Z",
    );
  });

  it("octagon, parallelogram and hexagon match section 3.2", () => {
    expect(shapePath("octagon", 100, 50)).toBe(`M12,0 H88 L100,12 V38 L88,50 H12 L0,38 V12 Z`);
    expect(shapePath("parallelogram", 100, 50)).toBe("M14,0 H100 L86,50 H0 Z");
    expect(shapePath("hexagon", 100, 50)).toBe("M20,0 H80 L100,25 L80,50 H20 L0,25 Z");
    expect(OCTAGON_CHAMFER).toBe(12);
  });

  it("inflate grows the box evenly and keeps slanted edges parallel", () => {
    expect(shapePath("octagon", 100, 50, 4)).toBe("M12,-4 H88 L104,12 V38 L88,54 H12 L-4,38 V12 Z");
    // Parallelogram slope (dx / dy) is unchanged by inflation.
    const base = flatten(shapePath("parallelogram", 100, 50))[3]!;
    const grown = flatten(shapePath("parallelogram", 100, 50, 4))[3]!;
    const slope = (s: Seg) => (s[1].x - s[0].x) / (s[1].y - s[0].y);
    expect(slope(grown)).toBeCloseTo(slope(base));
    const hexBase = flatten(shapePath("hexagon", 100, 50))[1]!;
    const hexGrown = flatten(shapePath("hexagon", 100, 50, 4))[1]!;
    expect(slope(hexGrown)).toBeCloseTo(slope(hexBase));
  });

  it("inflated outline stays outside the base outline", () => {
    for (const kind of KINDS) {
      const base = flatten(shapePath(kind, 200, 80));
      const grown = flatten(shapePath(kind, 200, 80, 4));
      // Top middle of the grown outline is about 4 px above the base top apex.
      const topMid = grown.map((s) => s[0]).reduce((a, b) => (b.y < a.y ? b : a));
      expect(outlineDistance(topMid, base)).toBeGreaterThan(3);
    }
  });
});

describe("shapeDetails", () => {
  it("orchestrator gets exactly a band; plain agent gets nothing", () => {
    const d = shapeDetails({ type: "agent", subtype: "orchestrator" }, 220, 88);
    expect(d).toEqual([{ kind: "band", d: "M0,24 V12 A12,12 0 0 1 12,0 H208 A12,12 0 0 1 220,12 V24 Z" }]);
    expect(shapeDetails({ type: "agent" }, 220, 88)).toEqual([]);
    expect(shapeDetails({ type: "tool" }, 200, 72)).toEqual([]);
    expect(shapeDetails({ type: "decision" }, 200, 80)).toEqual([]);
  });

  it("memory gets a lid rim and external gets a hatch", () => {
    const m = shapeDetails({ type: "memory" }, 200, 80);
    expect(m).toEqual([{ kind: "rim", d: "M0,8 A100,8 0 0 0 200,8" }]);
    const e = shapeDetails({ type: "external_system" }, 220, 80);
    expect(e).toHaveLength(1);
    expect(e[0]!.kind).toBe("hatch");
    expect(e[0]!.d).toMatch(/^M/);
    expect(e[0]!.d).not.toContain("url(");
  });
});

describe("hatchSegments", () => {
  it("emits 45 degree segments with endpoints on the parallelogram boundary", () => {
    const w = 220;
    const h = 80;
    const d = hatchSegments(w, h, 8);
    const nums = d.match(/-?\d*\.?\d+/g)!.map(Number);
    expect(nums.length % 4).toBe(0);
    expect(nums.length).toBeGreaterThan(20);
    const outline = flatten(shapePath("parallelogram", w, h));
    for (let i = 0; i < nums.length; i += 4) {
      const [x0, y0, x1, y1] = nums.slice(i, i + 4) as [number, number, number, number];
      expect(Math.abs(x1 - x0)).toBeCloseTo(Math.abs(y1 - y0), 1);
      expect(x1 - x0).toBeGreaterThan(0);
      expect(y1 - y0).toBeLessThan(0);
      expect(outlineDistance({ x: x0, y: y0 }, outline)).toBeLessThan(0.05);
      expect(outlineDistance({ x: x1, y: y1 }, outline)).toBeLessThan(0.05);
    }
  });

  it("is empty for a non-positive step or size", () => {
    expect(hatchSegments(100, 50, 0)).toBe("");
    expect(hatchSegments(0, 50, 8)).toBe("");
  });
});

describe("contentInsets", () => {
  it("follows section 3.3", () => {
    expect(contentInsets({ type: "agent" })).toEqual({ top: 10, right: 12, bottom: 8, left: 12 });
    expect(contentInsets({ type: "agent", subtype: "orchestrator" })).toEqual({ top: 0, right: 12, bottom: 6, left: 12 });
    expect(contentInsets({ type: "tool" })).toEqual({ top: 10, right: 14, bottom: 8, left: 14 });
    expect(contentInsets({ type: "memory", size: { width: 200, height: 80 } })).toEqual({
      top: 20,
      right: 12,
      bottom: 12,
      left: 12,
    });
    expect(contentInsets({ type: "external_system" })).toEqual({ top: 10, right: 26, bottom: 8, left: 26 });
    expect(contentInsets({ type: "decision" })).toEqual({ top: 10, right: 28, bottom: 8, left: 28 });
  });
});

// --- automatic ports ---

const rect = (x: number, y: number, width = 100, height = 50): Rect => ({ x, y, width, height });
const opposite: Record<PortSide, PortSide> = { top: "bottom", bottom: "top", left: "right", right: "left" };

describe("autoPorts (rule A)", () => {
  const S = rect(0, 0);
  const cases: [string, Rect, string, string, { source: PortSide; target: PortSide }][] = [
    ["target to the right", rect(300, 0), "a", "b", { source: "right", target: "left" }],
    ["target to the left", rect(-300, 0), "a", "b", { source: "left", target: "right" }],
    ["target below", rect(0, 300), "a", "b", { source: "bottom", target: "top" }],
    ["target above", rect(0, -300), "a", "b", { source: "top", target: "bottom" }],
    ["quadrant lower-right, wider gap in x", rect(300, 100), "a", "b", { source: "right", target: "left" }],
    ["quadrant lower-right, wider gap in y", rect(150, 300), "a", "b", { source: "bottom", target: "top" }],
    ["quadrant upper-left, wider gap in x", rect(-300, -100), "a", "b", { source: "left", target: "right" }],
    ["quadrant upper-left, wider gap in y", rect(-150, -300), "a", "b", { source: "top", target: "bottom" }],
    ["quadrant upper-right, wider gap in y", rect(150, -300), "a", "b", { source: "top", target: "bottom" }],
    ["quadrant lower-left, wider gap in x", rect(-300, 100), "a", "b", { source: "left", target: "right" }],
    ["equal gaps -> horizontal wins", rect(200, 150), "a", "b", { source: "right", target: "left" }],
    ["equal gaps up-left -> horizontal wins", rect(-200, -150), "a", "b", { source: "left", target: "right" }],
    ["overlapping, dx dominates", rect(60, 10), "a", "b", { source: "right", target: "left" }],
    ["overlapping, dy < 0 (gapX == gapY < 0)", rect(0, -20), "a", "b", { source: "top", target: "bottom" }],
    ["exact center, lower id is source (gapY wins for equal-size boxes)", rect(0, 0), "a", "b", { source: "bottom", target: "top" }],
    ["exact center, higher id is source", rect(0, 0), "b", "a", { source: "top", target: "bottom" }],
    ["aligned vertically, same x", rect(0, 100), "a", "b", { source: "bottom", target: "top" }],
  ];

  it.each(cases)("%s", (_name, T, sid, tid, expected) => {
    expect(autoPorts(S, T, sid, tid)).toEqual(expected);
  });

  it("swapping source and target attaches to the same physical sides", () => {
    for (const [, T, sid, tid, expected] of cases) {
      const swapped = autoPorts(T, S, tid, sid);
      expect(swapped).toEqual({ source: expected.target, target: expected.source });
      expect(opposite[swapped.source]).toBe(swapped.target);
    }
  });

  it("exact center with a tall target tie-breaks horizontally by id", () => {
    const wide = rect(40, -75, 20, 200);
    expect(autoPorts(S, wide, "a", "b")).toEqual({ source: "right", target: "left" });
    expect(autoPorts(S, wide, "b", "a")).toEqual({ source: "left", target: "right" });
  });

  it("is deterministic", () => {
    const a = autoPorts(S, rect(150, 150), "x", "y");
    const b = autoPorts(S, rect(150, 150), "x", "y");
    expect(a).toEqual(b);
  });
});

describe("autoPortFor (rule B)", () => {
  const r = rect(0, 0, 100, 50);
  it("picks the nearest anchor", () => {
    expect(autoPortFor("rounded", r, { x: 400, y: 25 })).toBe("right");
    expect(autoPortFor("rounded", r, { x: -300, y: 25 })).toBe("left");
    expect(autoPortFor("rounded", r, { x: 50, y: 400 })).toBe("bottom");
    expect(autoPortFor("rounded", r, { x: 50, y: -400 })).toBe("top");
  });

  it("uses the shape's real anchors (parallelogram side anchors are inset)", () => {
    // Anchor between left-inset (7,25) and top (50,0): nearer to left.
    expect(autoPortFor("parallelogram", r, { x: 0, y: 25 })).toBe("left");
  });

  it("breaks ties in the order right, bottom, left, top", () => {
    // Exact ties: center point is equidistant (50) horizontally from left/right? use a square.
    const sq = rect(0, 0, 100, 100);
    const center = { x: 50, y: 50 };
    expect(autoPortFor("rounded", sq, center)).toBe("right");
    // left vs top tie (point at top-left diagonal): left (0,50) and top (50,0) from (0,0).
    expect(autoPortFor("rounded", sq, { x: 0, y: 0 })).toBe("left");
    // right vs bottom tie from (100,100).
    expect(autoPortFor("rounded", sq, { x: 100, y: 100 })).toBe("right");
    // bottom vs left tie from (0,100).
    expect(autoPortFor("rounded", sq, { x: 0, y: 100 })).toBe("bottom");
  });
});

describe("resolvePorts", () => {
  const base = {
    sourceRect: rect(0, 0),
    targetRect: rect(300, 0),
    sourceKind: "rounded" as const,
    targetKind: "octagon" as const,
    sourceId: "a",
    targetId: "b",
  };
  it("uses rule A with no pins", () => {
    expect(resolvePorts(base)).toEqual({ source: "right", target: "left" });
    expect(resolvePorts({ ...base, pins: {} })).toEqual({ source: "right", target: "left" });
  });
  it("keeps full pins", () => {
    expect(resolvePorts({ ...base, pins: { source: "top", target: "bottom" } })).toEqual({
      source: "top",
      target: "bottom",
    });
  });
  it("applies rule B for the unpinned end", () => {
    expect(resolvePorts({ ...base, pins: { source: "right" } })).toEqual({ source: "right", target: "left" });
    expect(resolvePorts({ ...base, pins: { target: "top" } })).toEqual({ source: "right", target: "top" });
    expect(resolvePorts({ ...base, pins: { source: "bottom" } })).toEqual({ source: "bottom", target: "left" });
  });
});
