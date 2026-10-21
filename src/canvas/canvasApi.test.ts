import { describe, expect, it } from "vitest";
import { computeDiagramBounds } from "./bounds";
import { layoutDiagramLabels, type EdgeLabelSource } from "./edgeLabels";
import { layoutRelationship } from "./floating";

const rectA = { x: 0, y: 0, width: 200, height: 80 };
const rectB = { x: 600, y: 400, width: 200, height: 80 };
const measure = (text: string) => Array.from(text).length * 7;

function layout(sourceSide: "right" | "left", targetSide: "left" | "right") {
  return layoutRelationship({
    relationship: { sourceId: "a", targetId: "b", direction: "directed", visual: { ports: { source: sourceSide, target: targetSide } } },
    sourceRect: rectA,
    targetRect: rectB,
    sourceKind: "rounded",
    targetKind: "rounded",
  });
}

describe("getDiagramBounds contract (UI v2 refinement 4.1)", () => {
  it("contains every painted point of a bulging edge with its label placement", () => {
    // right -> right bulges well beyond both nodes; the label is laid out by the same function the canvas uses.
    const geometry = layout("right", "right");
    const edges: EdgeLabelSource[] = [{ id: "rel", text: "delegates research tasks", geometry }];
    const placements = layoutDiagramLabels({ componentRects: [rectA, rectB], groupRects: [], edges }, measure);
    const bounds = computeDiagramBounds({ nodeRects: [rectA, rectB], edges, placements: placements.values() });
    const inside = (p: { x: number; y: number }) =>
      p.x >= bounds.x - 1e-6 && p.x <= bounds.x + bounds.width + 1e-6 && p.y >= bounds.y - 1e-6 && p.y <= bounds.y + bounds.height + 1e-6;
    for (const p of [geometry.sourceTerminal, geometry.targetTerminal, geometry.p0, geometry.p3]) expect(inside(p)).toBe(true);
    if (geometry.arrow) expect(inside(geometry.arrow.tip)).toBe(true);
    for (const placement of placements.values()) {
      const { plate } = placement;
      for (const p of [
        { x: plate.x, y: plate.y },
        { x: plate.x + plate.width, y: plate.y + plate.height },
      ]) {
        expect(inside(p)).toBe(true);
      }
    }
    for (const rect of [rectA, rectB]) {
      expect(inside({ x: rect.x - 1, y: rect.y - 1 })).toBe(true);
      expect(inside({ x: rect.x + rect.width + 1, y: rect.y + rect.height + 1 })).toBe(true);
    }
    // The bulge exceeds the node bounds on the right (the case that v1 bounds cropped).
    expect(bounds.x + bounds.width).toBeGreaterThan(rectB.x + rectB.width);
  });
});
