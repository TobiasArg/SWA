import { describe, expect, it } from "vitest";
import { applySelectionChanges, selectionFromFocusedElement } from "./selection";
import { mergeProjectedNodes } from "./nodeState";
import { toFlowNodes } from "./projection";
import { EMPTY_SELECTION, createFakeStore } from "./testing/fakeStore";
import { buildFixtureArchitecture } from "./testing/fixtures";

const architecture = buildFixtureArchitecture();

describe("applySelectionChanges", () => {
  it("splits node changes into components and groups and edge changes into relationships", () => {
    const next = applySelectionChanges(
      architecture,
      EMPTY_SELECTION,
      [
        { type: "select", id: "cmp_orch", selected: true },
        { type: "select", id: "grp_research", selected: true },
      ],
      [{ type: "select", id: "rel_reads", selected: true }],
    );
    expect(next).toEqual({ componentIds: ["cmp_orch"], relationshipIds: ["rel_reads"], groupIds: ["grp_research"] });
  });

  it("removes deselected ids, ignores unknown ids and returns null when nothing changes", () => {
    const current = { componentIds: ["cmp_orch", "cmp_crm"], relationshipIds: [], groupIds: [] };
    expect(
      applySelectionChanges(architecture, current, [{ type: "select", id: "cmp_orch", selected: false }], []),
    ).toEqual({ componentIds: ["cmp_crm"], relationshipIds: [], groupIds: [] });
    expect(applySelectionChanges(architecture, current, [{ type: "select", id: "nope", selected: true }], [])).toBeNull();
    expect(applySelectionChanges(architecture, current, [{ type: "select", id: "cmp_crm", selected: true }], [])).toBeNull();
  });
});

describe("selectionFromFocusedElement", () => {
  function element(className: string, id: string) {
    const el = document.createElement("div");
    el.className = className;
    el.setAttribute("data-id", id);
    return el;
  }

  it("selects the focused node or edge", () => {
    expect(selectionFromFocusedElement(architecture, EMPTY_SELECTION, element("react-flow__node", "cmp_crm"), false)).toEqual(
      { componentIds: ["cmp_crm"], relationshipIds: [], groupIds: [] },
    );
    expect(
      selectionFromFocusedElement(architecture, EMPTY_SELECTION, element("react-flow__node", "grp_empty"), false),
    ).toEqual({ componentIds: [], relationshipIds: [], groupIds: ["grp_empty"] });
    expect(
      selectionFromFocusedElement(architecture, EMPTY_SELECTION, element("react-flow__edge", "rel_reads"), false),
    ).toEqual({ componentIds: [], relationshipIds: ["rel_reads"], groupIds: [] });
  });

  it("toggles with the additive modifier and ignores other targets", () => {
    const current = { componentIds: ["cmp_crm"], relationshipIds: [], groupIds: [] };
    expect(selectionFromFocusedElement(architecture, current, element("react-flow__node", "cmp_crm"), true)).toEqual(
      EMPTY_SELECTION,
    );
    expect(selectionFromFocusedElement(architecture, current, element("sa-node", "cmp_crm"), false)).toBeNull();
    expect(selectionFromFocusedElement(architecture, current, null, false)).toBeNull();
  });
});

describe("mergeProjectedNodes", () => {
  const projected = toFlowNodes(architecture, EMPTY_SELECTION);

  it("carries measured size for known nodes and leaves new nodes untouched", () => {
    const merged = mergeProjectedNodes(projected, projected.slice(0, 2), false);
    expect(merged[0]!.measured).toEqual({ width: projected[0]!.width, height: projected[0]!.height });
    expect(merged[3]!.measured).toBeUndefined();
  });

  it("keeps transient positions of dragging nodes only when preserving gestures", () => {
    const previous = projected.map((node) =>
      node.id === "cmp_orch" ? { ...node, position: { x: 999, y: 999 }, dragging: true } : node,
    );
    const preserved = mergeProjectedNodes(projected, previous, true).find((n) => n.id === "cmp_orch")!;
    expect(preserved.position).toEqual({ x: 999, y: 999 });
    const reset = mergeProjectedNodes(projected, previous, false).find((n) => n.id === "cmp_orch")!;
    expect(reset.position).toEqual({ x: 80, y: 80 });
  });
});

describe("fake store (recording wrapper around the real editor store)", () => {
  it("records commands and applies moves with group bounds recomputation", () => {
    const store = createFakeStore(architecture);
    const result = store.dispatch({
      kind: "moveElements",
      componentPositions: { cmp_validation: { x: 1000, y: 300 } },
      groupDeltas: {},
    });
    expect(result.ok).toBe(true);
    expect(store.commands).toHaveLength(1);
    const group = store.getState().architecture.groups.find((g) => g.id === "grp_research")!;
    expect(group.bounds.width).toBe(1000 + 220 - 420 + 48);
    expect(store.getState().canUndo).toBe(true);
    store.undo();
    expect(store.getState().architecture.groups.find((g) => g.id === "grp_research")!.bounds).toEqual(
      architecture.groups[0]!.bounds,
    );
  });

  it("clamps resizes, cascades deletes and reports domain errors", () => {
    const store = createFakeStore(architecture, { componentIds: ["cmp_store"], relationshipIds: [], groupIds: [] });
    expect(store.getState().selection.componentIds).toEqual(["cmp_store"]);
    store.dispatch({ kind: "resizeComponent", id: "cmp_crm", position: { x: 0, y: 0 }, size: { width: 10, height: 999 } });
    expect(store.getState().architecture.components.find((c) => c.id === "cmp_crm")!.size).toEqual({
      width: 160,
      height: 320,
    });
    store.dispatch({ kind: "deleteElements", componentIds: ["cmp_store"], relationshipIds: [], groupIds: [] });
    expect(store.getState().architecture.relationships.some((r) => r.id === "rel_reads")).toBe(false);
    expect(store.getState().selection.componentIds).toEqual([]);
    const rejected = store.dispatch({
      kind: "addRelationship",
      relationship: { id: "rel_x", type: "uses", sourceId: "cmp_crm", targetId: "grp_empty", direction: "directed" },
    });
    expect(rejected.ok).toBe(false);
    expect(store.commands).toHaveLength(3);
  });
});
