import { describe, expect, it } from "vitest";
import type { Rect, Relationship } from "../domain/types";
import {
  LABEL_CLEARANCE,
  edgeObstacles,
  labelPlacementBounds,
  layoutDiagramLabels,
  layoutEdgeLabels,
  nearestPointOnRectBoundary,
  segmentCrossesRect,
  splitLabel,
  type EdgeLabelSource,
  type LabelPlacement,
  type LabelRequest,
} from "./edgeLabels";
import { computeParallelInfo, cubicPoint, layoutRelationship, type RelationshipLayout } from "./floating";

/** U7: every test injects a 7 px per character measure. */
const measure = (text: string) => Array.from(text).length * 7;

const agent = (x: number, y = 100): Rect => ({ x, y, width: 220, height: 88 });

function rel(id: string, sourceId: string, targetId: string, direction: "directed" | "undirected" = "directed"): Relationship {
  return { id, type: "uses", sourceId, targetId, direction };
}

/** Edge label sources with real §2.2 geometry between Agent boxes, with parallel info like the canvas. */
function sources(
  rects: Record<string, Rect>,
  edges: { rel: Relationship; text: string }[],
): (EdgeLabelSource & { geometry: RelationshipLayout })[] {
  const parallel = computeParallelInfo(edges.map((edge) => edge.rel));
  return edges.map(({ rel: relationship, text }) => {
    const info = parallel.get(relationship.id)!;
    const geometry = layoutRelationship({
      relationship,
      sourceRect: rects[relationship.sourceId]!,
      targetRect: rects[relationship.targetId]!,
      sourceKind: "rounded",
      targetKind: "rounded",
      parallelOffset: info.parallelOffset,
      labelPosition: info.labelPosition,
    });
    return { id: relationship.id, text, geometry };
  });
}

function inflate(r: Rect, by = LABEL_CLEARANCE): Rect {
  return { x: r.x - by, y: r.y - by, width: r.width + 2 * by, height: r.height + 2 * by };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

const placementOf = (map: Map<string, LabelPlacement>, id: string) => {
  const placement = map.get(id);
  expect(placement, `placement for ${id}`).toBeDefined();
  return placement!;
};

/** The §3.5 review layout: Agents A, B, C at x = 100, 400, 700. */
const reviewRects = { A: agent(100), B: agent(400), C: agent(700) };
const reviewEdges = [
  { rel: { ...rel("rel_ab", "A", "B"), type: "delegates_to", label: "coordinates" } as Relationship, text: "delegates to · coordinates" },
  { rel: rel("rel_bc", "B", "C"), text: "uses" },
  { rel: { ...rel("rel_share", "B", "C", "undirected"), type: "shares_context_with" } as Relationship, text: "shares context with" },
];

describe("splitLabel (Stage B)", () => {
  it("splits at the first ' · ' and keeps the dot on line 1", () => {
    expect(splitLabel("delegates to · coordinates · more")).toEqual(["delegates to ·", "coordinates · more"]);
  });

  it("otherwise splits at the space closest to the middle, earlier space on a tie", () => {
    expect(splitLabel("shares context with")).toEqual(["shares", "context with"]);
    expect(splitLabel("ab cd ef")).toEqual(["ab cd", "ef"]);
    expect(splitLabel("abc d efg")).toEqual(["abc", "d efg"]); // tie: earlier space
    expect(splitLabel("nospace")).toBeNull();
  });
});

describe("geometry helpers", () => {
  it("finds the nearest boundary point and segment/rect interior crossings", () => {
    const r = { x: 0, y: 0, width: 10, height: 10 };
    expect(nearestPointOnRectBoundary({ x: 5, y: 20 }, r)).toEqual({ x: 5, y: 10 });
    expect(nearestPointOnRectBoundary({ x: 5, y: 2 }, r)).toEqual({ x: 5, y: 0 });
    expect(segmentCrossesRect({ x: -5, y: 5 }, { x: 15, y: 5 }, r)).toBe(true);
    expect(segmentCrossesRect({ x: -5, y: 10 }, { x: 15, y: 10 }, r)).toBe(false); // along the edge
    expect(segmentCrossesRect({ x: -5, y: 20 }, { x: 15, y: 20 }, r)).toBe(false);
  });

  it("builds arrowhead and terminal obstacles and placement bounds including the leader", () => {
    const [ab] = sources(reviewRects, [reviewEdges[0]!]);
    expect(edgeObstacles(ab!.geometry)).toHaveLength(3);
    const bounds = labelPlacementBounds({
      mode: "callout",
      lines: ["x"],
      plate: { x: 0, y: 0, width: 10, height: 10 },
      leader: { from: { x: 5, y: 30 }, to: { x: 5, y: 10 } },
    });
    expect(bounds).toEqual({ x: 0, y: 0, width: 10, height: 30 });
  });
});

describe("U7 label stages", () => {
  it("(a) a short label in a wide gap stays on the path at baseT", () => {
    const rects = { A: agent(100), B: agent(700) };
    const [edge] = sources(rects, [{ rel: rel("r", "A", "B"), text: "uses" }]);
    const placement = placementOf(
      layoutDiagramLabels({ componentRects: Object.values(rects), groupRects: [], edges: [edge!] }, measure),
      "r",
    );
    expect(placement.mode).toBe("path");
    expect(placement.lines).toEqual(["uses"]);
    expect(placement.leader).toBeNull();
    expect(placement.plate.width).toBe(4 * 7 + 12);
    expect(placement.plate.height).toBe(19);
    expect(placement.plate.x + placement.plate.width / 2).toBeCloseTo(edge!.geometry.labelX, 9);
    expect(placement.plate.y + placement.plate.height / 2).toBeCloseTo(edge!.geometry.labelY, 9);
  });

  it("(b) the §3.5 review layout puts A→B in a callout above the pair, clear of every node, with the full text", () => {
    const edges = sources(reviewRects, reviewEdges);
    const nodes = Object.values(reviewRects);
    const result = layoutDiagramLabels({ componentRects: nodes, groupRects: [], edges }, measure);
    const ab = placementOf(result, "rel_ab");
    expect(ab.mode).toBe("callout");
    expect(ab.lines).toEqual(["delegates to · coordinates"]);
    expect(ab.leader).not.toBeNull();
    // Chosen along b̂ = (0, -1): above the pair, plate bottom ≤ node top − clearance.
    expect(ab.plate.y + ab.plate.height).toBeLessThanOrEqual(96 + 1e-9);
    const q = cubicPoint(edges[0]!.geometry.p0, edges[0]!.geometry.p1, edges[0]!.geometry.p2, edges[0]!.geometry.p3, edges[0]!.geometry.labelT);
    expect(ab.plate.x + ab.plate.width / 2).toBeCloseTo(q.x, 9);
    expect(ab.leader!.from).toEqual(q);
    for (const placement of result.values()) {
      for (const node of nodes) expect(overlaps(placement.plate, inflate(node))).toBe(false);
    }
    // Every label keeps its full text.
    for (const { rel: r, text } of reviewEdges) expect(placementOf(result, r.id).lines.join(" ")).toBe(text);
  });

  it("(c) a gap that fits 'delegates to ·' but not the full line wraps on the path", () => {
    const rects = { A: agent(100), B: agent(480) }; // 160 px gap
    const [edge] = sources(rects, [{ rel: rel("r", "A", "B", "undirected"), text: "delegates to · coordinates" }]);
    const placement = placementOf(
      layoutDiagramLabels({ componentRects: Object.values(rects), groupRects: [], edges: [edge!] }, measure),
      "r",
    );
    expect(placement.mode).toBe("path-wrapped");
    expect(placement.lines).toEqual(["delegates to ·", "coordinates"]);
    expect(placement.plate.width).toBe(14 * 7 + 12);
    expect(placement.plate.height).toBe(34);
    expect(placement.leader).toBeNull();
  });

  it("(d) six labels between one pair never overlap each other", () => {
    const rects = { A: agent(100), B: agent(400) };
    const six = Array.from({ length: 6 }, (_, i) => ({
      rel: rel(`r${i}`, i % 2 ? "B" : "A", i % 2 ? "A" : "B", i % 3 ? "directed" : "undirected"),
      text: `relationship number ${i}`,
    }));
    const result = layoutDiagramLabels(
      { componentRects: Object.values(rects), groupRects: [], edges: sources(rects, six) },
      measure,
    );
    expect(result.size).toBe(6);
    const plates = [...result.values()].map((p) => p.plate);
    plates.forEach((a, i) =>
      plates.forEach((b, j) => {
        if (i !== j) expect(overlaps(inflate(a), b)).toBe(false);
      }),
    );
    for (const plate of plates) for (const node of Object.values(rects)) expect(overlaps(plate, inflate(node))).toBe(false);
  });

  it("(e) a closed ring of obstacles reaches Stage D, terminates and clears the ring", () => {
    const q = { x: 500, y: 500 };
    const request: LabelRequest = {
      id: "r",
      text: "label",
      curve: [
        { x: q.x - 3, y: q.y },
        { x: q.x - 1, y: q.y },
        { x: q.x + 1, y: q.y },
        { x: q.x + 3, y: q.y },
      ],
      baseT: 0.5,
      bowNormal: { x: 0, y: -1 },
    };
    const R = 1000;
    const hole = 5;
    const ring: Rect[] = [
      { x: q.x - R, y: q.y - R, width: 2 * R, height: R - hole }, // top
      { x: q.x - R, y: q.y + hole, width: 2 * R, height: R - hole }, // bottom
      { x: q.x - R, y: q.y - hole, width: R - hole, height: 2 * hole }, // left
      { x: q.x + hole, y: q.y - hole, width: R - hole, height: 2 * hole }, // right
    ];
    const placement = placementOf(layoutEdgeLabels([request], ring, measure), "r");
    expect(placement.mode).toBe("callout");
    expect(placement.lines).toEqual(["label"]);
    // Stage D: bottom snapped to the top of the inflated ring.
    expect(placement.plate.y + placement.plate.height).toBeCloseTo(q.y - R - LABEL_CLEARANCE, 9);
    expect(placement.plate.x + placement.plate.width / 2).toBeCloseTo(q.x, 9);
    for (const obstacle of ring) expect(overlaps(placement.plate, inflate(obstacle))).toBe(false);
    expect(placement.leader!.from.x).toBeCloseTo(q.x, 9);
    expect(placement.leader!.to.y).toBeCloseTo(placement.plate.y + placement.plate.height, 9);
  });

  it("(f) the output is independent of request array order", () => {
    const edges = sources(reviewRects, reviewEdges);
    const input = (list: EdgeLabelSource[]) => ({ componentRects: Object.values(reviewRects), groupRects: [], edges: list });
    const forward = layoutDiagramLabels(input(edges), measure);
    const reversed = layoutDiagramLabels(input([...edges].reverse()), measure);
    const rotated = layoutDiagramLabels(input([edges[1]!, edges[2]!, edges[0]!]), measure);
    const asObject = (map: Map<string, LabelPlacement>) => Object.fromEntries([...map].sort(([a], [b]) => (a < b ? -1 : 1)));
    expect(asObject(reversed)).toEqual(asObject(forward));
    expect(asObject(rotated)).toEqual(asObject(forward));
  });
});

describe("obstacles", () => {
  it("treats group header strips (not group bodies) as obstacles", () => {
    const rects = { A: agent(100, 300), B: agent(700, 300) };
    const [edge] = sources(rects, [{ rel: rel("r", "A", "B"), text: "uses" }]);
    const label = { x: edge!.geometry.labelX, y: edge!.geometry.labelY };
    // A group whose body contains the label point: no effect.
    const body = { x: 0, y: label.y - 100, width: 1200, height: 400 };
    const inBody = placementOf(layoutDiagramLabels({ componentRects: Object.values(rects), groupRects: [body], edges: [edge!] }, measure), "r");
    expect(inBody.mode).toBe("path");
    // A group whose 32 px header strip covers every on-path candidate: the label moves off it.
    const header = { x: 0, y: label.y - 40, width: 1200, height: 400 };
    const result = placementOf(layoutDiagramLabels({ componentRects: Object.values(rects), groupRects: [header], edges: [edge!] }, measure), "r");
    expect(overlaps(result.plate, inflate({ x: 0, y: label.y - 40, width: 1200, height: 32 }))).toBe(false);
  });

  it("skips edges without text", () => {
    const [edge] = sources(reviewRects, [{ rel: rel("r", "A", "B"), text: "" }]);
    expect(layoutDiagramLabels({ componentRects: [], groupRects: [], edges: [edge!] }, measure).size).toBe(0);
  });
});
