import { render } from "@testing-library/react";
import type { EdgeProps } from "@xyflow/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Component, Relationship } from "../../domain/types";
import type { RelationshipFlowEdge } from "../flowTypes";
import { makeComponent, makeRelationship } from "../testing/fixtures";
import { RelationshipEdge } from "./RelationshipEdge";

type Rect = { x: number; y: number; width: number; height: number };
const nodes = new Map<string, { type: string; data: { component: Component }; internals: { positionAbsolute: { x: number; y: number } }; measured: { width: number; height: number } }>();

vi.mock("@xyflow/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@xyflow/react")>()),
  useInternalNode: (id: string) => nodes.get(id),
}));

function place(component: Component, rect: Rect) {
  nodes.set(component.id, {
    type: "component",
    data: { component },
    internals: { positionAbsolute: { x: rect.x, y: rect.y } },
    measured: { width: rect.width, height: rect.height },
  });
}

const agentA = makeComponent({ id: "a", type: "agent" });
const toolB = makeComponent({ id: "b", type: "tool" });

function renderEdge(relationship: Relationship, info: { parallelOffset?: number; labelPosition?: number } = {}) {
  const props = {
    id: relationship.id,
    source: relationship.sourceId,
    target: relationship.targetId,
    label: "Uses",
    interactionWidth: 16,
    markerEnd: relationship.direction === "directed" ? { type: "arrowclosed" } : undefined,
    data: {
      relationship,
      parallelIndex: 0,
      parallelCount: 1,
      parallelOffset: info.parallelOffset ?? 0,
      labelPosition: info.labelPosition ?? 0.5,
    },
  } as unknown as EdgeProps<RelationshipFlowEdge>;
  return render(
    <svg>
      <RelationshipEdge {...props} />
    </svg>,
  );
}

const pathD = (c: HTMLElement) => c.querySelector(".sa-edge-path")!.getAttribute("d")!;
const terminal = (c: HTMLElement, end: "source" | "target") =>
  c.querySelector<SVGCircleElement>(`.sa-edge-terminal[data-terminal="${end}"]`)!;

beforeEach(() => {
  // jsdom has no SVG text metrics (used by the label plate).
  (SVGElement.prototype as unknown as { getBBox: () => Rect }).getBBox = () => ({ x: 0, y: 0, width: 40, height: 14 });
  nodes.clear();
  place(agentA, { x: 0, y: 0, width: 160, height: 80 });
  place(toolB, { x: 400, y: 0, width: 160, height: 80 });
});

describe("RelationshipEdge", () => {
  it("draws a cubic with an inline arrowhead only when directed, and no <marker> or url() reference", () => {
    const directed = renderEdge(makeRelationship({ id: "r", sourceId: "a", targetId: "b", direction: "directed" }));
    expect(pathD(directed.container)).toMatch(/^M [\d.-]+ [\d.-]+ C /);
    expect(directed.container.querySelectorAll(".sa-edge-arrow")).toHaveLength(1);
    expect(directed.container.querySelector("marker")).toBeNull();
    expect(directed.container.innerHTML).not.toContain("url(");
    expect(directed.container.querySelector(".sa-edge-path--undirected")).toBeNull();
    directed.unmount();

    const undirected = renderEdge(makeRelationship({ id: "r", sourceId: "a", targetId: "b", direction: "undirected" }));
    expect(undirected.container.querySelector(".sa-edge-arrow")).toBeNull();
    expect(undirected.container.querySelector(".sa-edge-path--undirected")).not.toBeNull();
  });

  it("draws two identical terminal rings on every edge, centered on the port anchors", () => {
    for (const direction of ["directed", "undirected"] as const) {
      const { container, unmount } = renderEdge(makeRelationship({ id: "r", sourceId: "a", targetId: "b", direction }));
      expect(container.querySelectorAll(".sa-edge-terminal")).toHaveLength(2);
      const s = terminal(container, "source");
      const t = terminal(container, "target");
      expect(s.getAttribute("r")).toBe(t.getAttribute("r"));
      // Automatic sides: A right (160, 40) -> B left (400, 40).
      expect([s.getAttribute("cx"), s.getAttribute("cy")]).toEqual(["160", "40"]);
      expect([t.getAttribute("cx"), t.getAttribute("cy")]).toEqual(["400", "40"]);
      unmount();
    }
  });

  it("uses pinned sides when stored and ignores node arrangement", () => {
    const pinned = renderEdge(
      makeRelationship({ id: "r", sourceId: "a", targetId: "b", visual: { ports: { source: "top", target: "bottom" } } }),
    );
    expect(terminal(pinned.container, "source")).toHaveAttribute("data-side", "top");
    expect(terminal(pinned.container, "target")).toHaveAttribute("data-side", "bottom");
    expect(terminal(pinned.container, "source").getAttribute("cy")).toBe("0");
    expect(terminal(pinned.container, "target").getAttribute("cy")).toBe("80");
  });

  it("re-routes an automatic edge when a node moves (re-render with new rects)", () => {
    const rel = makeRelationship({ id: "r", sourceId: "a", targetId: "b" });
    const first = renderEdge(rel);
    expect(terminal(first.container, "source")).toHaveAttribute("data-side", "right");
    first.unmount();
    place(toolB, { x: 0, y: 300, width: 160, height: 80 });
    const second = renderEdge(rel);
    expect(terminal(second.container, "source")).toHaveAttribute("data-side", "bottom");
    expect(terminal(second.container, "target")).toHaveAttribute("data-side", "top");
  });

  it("keeps the automatic end next to a single pin (Rule B)", () => {
    const { container } = renderEdge(
      makeRelationship({ id: "r", sourceId: "a", targetId: "b", visual: { ports: { source: "right" } } }),
    );
    expect(terminal(container, "target")).toHaveAttribute("data-side", "left");
  });

  it("renders an undirected relationship identically when its stored order is swapped", () => {
    const fwd = renderEdge(makeRelationship({ id: "r", sourceId: "a", targetId: "b", direction: "undirected" }));
    const fwdTerminals = [terminal(fwd.container, "source").outerHTML, terminal(fwd.container, "target").outerHTML];
    const fwdD = pathD(fwd.container);
    fwd.unmount();
    const rev = renderEdge(makeRelationship({ id: "r", sourceId: "b", targetId: "a", direction: "undirected" }));
    // Canonical order (UI_V2_REFINEMENT 2.2 step 0): the identical physical curve.
    expect(pathD(rev.container)).toBe(fwdD);
    // Terminals keep their stored roles but occupy the same positions.
    expect(terminal(rev.container, "target").outerHTML).toBe(fwdTerminals[0]!.replace('data-terminal="source"', 'data-terminal="target"'));
    expect(terminal(rev.container, "source").outerHTML).toBe(fwdTerminals[1]!.replace('data-terminal="target"', 'data-terminal="source"'));
  });

  it("never animates", () => {
    const { container } = renderEdge(makeRelationship({ id: "r", sourceId: "a", targetId: "b" }));
    expect(container.querySelector("animate, animateMotion, .animated")).toBeNull();
  });

  it("renders nothing until both nodes exist", () => {
    nodes.delete("b");
    const { container } = renderEdge(makeRelationship({ id: "r", sourceId: "a", targetId: "b" }));
    expect(container.querySelector(".sa-edge-path")).toBeNull();
  });
});
