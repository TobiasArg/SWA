import { MarkerType } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { DEFAULT_SIZE } from "../domain/constants";
import { EMPTY_SELECTION } from "./testing/fakeStore";
import { buildFixtureArchitecture } from "./testing/fixtures";
import { isComponentNode, isGroupNode } from "./flowTypes";
import { toFlowEdges, toFlowNodes } from "./projection";

const architecture = buildFixtureArchitecture();

describe("toFlowNodes", () => {
  const nodes = toFlowNodes(architecture, EMPTY_SELECTION);

  it("puts group nodes before component nodes", () => {
    const firstComponent = nodes.findIndex(isComponentNode);
    const lastGroup = nodes.map(isGroupNode).lastIndexOf(true);
    expect(lastGroup).toBe(architecture.groups.length - 1);
    expect(firstComponent).toBe(architecture.groups.length);
    expect(nodes).toHaveLength(architecture.groups.length + architecture.components.length);
  });

  it("never uses parentId", () => {
    for (const node of nodes) expect(node).not.toHaveProperty("parentId");
  });

  it("projects groups as non-connectable header-dragged containers at their bounds", () => {
    const group = nodes.find((n) => n.id === "grp_research")!;
    const bounds = architecture.groups[0]!.bounds;
    expect(group).toMatchObject({
      type: "group-container",
      position: { x: bounds.x, y: bounds.y },
      width: bounds.width,
      height: bounds.height,
      draggable: true,
      dragHandle: ".sa-group-header",
      connectable: false,
      selectable: true,
      zIndex: 0,
      style: { pointerEvents: "none" },
    });
  });

  it("uses the effective size as fixed width/height", () => {
    const agent = nodes.find((n) => n.id === "cmp_discovery")!;
    expect(agent.width).toBe(DEFAULT_SIZE.agent.width);
    expect(agent.height).toBe(DEFAULT_SIZE.agent.height);
    const resized = nodes.find((n) => n.id === "cmp_router")!;
    expect([resized.width, resized.height]).toEqual([240, 96]);
  });

  it("sets component metadata, accessibility attributes and group name", () => {
    const node = nodes.find((n) => n.id === "cmp_discovery")!;
    expect(node).toMatchObject({
      type: "component",
      zIndex: 10,
      ariaLabel: "Agent: Discovery Agent. Finds new leads.",
      domAttributes: { "aria-roledescription": "component" },
      data: { groupName: "Research Team" },
    });
    expect(nodes.find((n) => n.id === "cmp_orch")!.data).not.toHaveProperty("groupName");
  });

  it("reflects the store selection", () => {
    const selected = toFlowNodes(architecture, {
      componentIds: ["cmp_orch"],
      relationshipIds: [],
      groupIds: ["grp_empty"],
    });
    expect(selected.filter((n) => n.selected).map((n) => n.id).sort()).toEqual(["cmp_orch", "grp_empty"]);
  });
});

describe("toFlowEdges", () => {
  const edges = toFlowEdges(architecture, { ...EMPTY_SELECTION, relationshipIds: ["rel_reads"] });
  const byId = (id: string) => edges.find((e) => e.id === id)!;

  it("adds an arrow at the target only for directed relationships", () => {
    expect(byId("rel_reads").markerEnd).toEqual({ type: MarkerType.ArrowClosed });
    expect(byId("rel_shares").markerEnd).toBeUndefined();
    expect(byId("rel_uses_2").markerEnd).toBeUndefined();
    for (const edge of edges) expect(edge.markerStart).toBeUndefined();
  });

  it("maps endpoints, type, z-index, interaction width, labels and selection", () => {
    expect(byId("rel_reads")).toMatchObject({
      type: "relationship",
      source: "cmp_validation",
      target: "cmp_store",
      zIndex: 5,
      interactionWidth: 16,
      label: "reads from · lead records",
      ariaLabel: "Validation Agent reads from Shared Lead Store (label: lead records).",
      selected: true,
    });
    expect(byId("rel_shares").selected).toBe(false);
    expect(byId("rel_generic").label).toHaveLength(40);
  });

  it("offsets parallel relationships regardless of stored order", () => {
    const first = byId("rel_uses_1").data!;
    const second = byId("rel_uses_2").data!;
    expect(first).toMatchObject({ parallelIndex: 0, parallelCount: 2, parallelOffset: 0, labelPosition: 0.5 });
    expect(second.parallelIndex).toBe(1);
    expect(Math.abs(second.parallelOffset)).toBe(12);
    expect(byId("rel_reads").data).toMatchObject({ parallelCount: 1, parallelOffset: 0 });
  });
});
