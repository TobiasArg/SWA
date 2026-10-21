import { describe, expect, it } from "vitest";
import { LABEL_PLATE_HEIGHT, computeDiagramBounds, estimateLabelPlate } from "./canvasApi";
import { layoutRelationship } from "./floating";

const rectA = { x: 0, y: 0, width: 200, height: 80 };
const rectB = { x: 600, y: 400, width: 200, height: 80 };

function layout(sourceSide: "right" | "left", targetSide: "left" | "right") {
  return layoutRelationship({
    relationship: { sourceId: "a", targetId: "b", direction: "directed", visual: { ports: { source: sourceSide, target: targetSide } } },
    sourceRect: rectA,
    targetRect: rectB,
    sourceKind: "rounded",
    targetKind: "rounded",
  });
}

describe("computeDiagramBounds (UI v2 section 12.6)", () => {
  it("contains every control point, terminal, arrow tip and the label plate", () => {
    // right -> right bulges well beyond both nodes.
    const geometry = layout("right", "right");
    const label = "delegates research tasks";
    const bounds = computeDiagramBounds({ x: 0, y: 0, width: 800, height: 480 }, [{ geometry, label }]);
    const inside = (p: { x: number; y: number }) =>
      p.x >= bounds.x - 1e-6 && p.x <= bounds.x + bounds.width + 1e-6 && p.y >= bounds.y - 1e-6 && p.y <= bounds.y + bounds.height + 1e-6;
    for (const p of [geometry.p0, geometry.p1, geometry.p2, geometry.p3, geometry.sourceTerminal, geometry.targetTerminal]) {
      expect(inside(p)).toBe(true);
    }
    if (geometry.arrow) expect(inside(geometry.arrow.tip)).toBe(true);
    const plate = estimateLabelPlate(label, { x: geometry.labelX, y: geometry.labelY })!;
    for (const p of [
      { x: plate.x, y: plate.y },
      { x: plate.x + plate.width, y: plate.y + plate.height },
    ]) {
      expect(inside(p)).toBe(true);
    }
    // The bulge exceeds the node bounds on the right (the case that v1 bounds cropped).
    expect(bounds.x + bounds.width).toBeGreaterThan(800);
  });

  it("equals the node bounds when there are no edges and is empty with nothing", () => {
    expect(computeDiagramBounds(rectA, [])).toEqual(rectA);
    expect(computeDiagramBounds(null, [])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it("estimates a plate only for non-empty labels, centered on the label point", () => {
    expect(estimateLabelPlate("", { x: 0, y: 0 })).toBeNull();
    expect(estimateLabelPlate(undefined, { x: 0, y: 0 })).toBeNull();
    const plate = estimateLabelPlate("abcd", { x: 100, y: 50 })!;
    expect(plate.x + plate.width / 2).toBe(100);
    expect(plate.height).toBe(LABEL_PLATE_HEIGHT);
  });
});
