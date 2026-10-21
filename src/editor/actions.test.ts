import { describe, expect, it, vi } from "vitest";
import { createEditorStore } from "./store";
import { deleteSelection, duplicateSelection, groupSelection, nudgeSelection, ungroupSelection } from "./actions";
import type { Architecture, Component } from "../domain/types";

function component(id: string, name: string, x = 0): Component {
  return { id, type: "agent", name, position: { x, y: 0 } };
}

function architecture(): Architecture {
  const components = [component("cmp_a", "A"), component("cmp_b", "B", 250)];
  return {
    id: "arch_test",
    name: "Test",
    createdAt: "2026-10-21T00:00:00Z",
    updatedAt: "2026-10-21T00:00:00Z",
    components,
    relationships: [
      { id: "rel_ab", type: "uses", sourceId: "cmp_a", targetId: "cmp_b", direction: "directed" },
      { id: "rel_ba", type: "depends_on", sourceId: "cmp_b", targetId: "cmp_a", direction: "directed" },
    ],
    groups: [{ id: "grp_team", name: "Group", memberComponentIds: ["cmp_a"], bounds: { x: -24, y: -56, width: 268, height: 136 } }],
  };
}

describe("UI-agnostic editor actions", () => {
  it("deletes selected components with their relationships and group membership, then provides undo feedback", () => {
    const store = createEditorStore(architecture(), () => "edit");
    store.setSelection({ componentIds: ["cmp_a"], relationshipIds: [], groupIds: [] });
    const showToast = vi.fn();
    const announce = vi.fn();

    const result = deleteSelection(store, { showToast, announce });
    const message = "Deleted 1 component and 2 relationships.";
    expect(result.ok).toBe(true);
    expect(store.getState().architecture.components.map((item) => item.id)).toEqual(["cmp_b"]);
    expect(store.getState().architecture.relationships).toEqual([]);
    expect(store.getState().architecture.groups[0]?.memberComponentIds).toEqual([]);
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(message, {
      action: { label: "Undo", onClick: expect.any(Function) },
    });
    expect(announce).toHaveBeenCalledWith(message);

    const toastOptions = showToast.mock.calls[0]?.[1] as { action: { onClick: () => void } };
    toastOptions.action.onClick();
    expect(store.getState().architecture.components.map((item) => item.id)).toEqual(["cmp_a", "cmp_b"]);
    expect(store.getState().architecture.relationships).toHaveLength(2);
    expect(store.getState().architecture.groups[0]?.memberComponentIds).toEqual(["cmp_a"]);
  });

  it("does not show deletion feedback when the selection is empty", () => {
    const store = createEditorStore(architecture(), () => "edit");
    const showToast = vi.fn();
    const announce = vi.fn();
    deleteSelection(store, { showToast, announce });
    expect(showToast).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
  });

  it("duplicates only selected components, applies the domain offset, and selects the copies", () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValueOnce("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    const store = createEditorStore(architecture(), () => "edit");
    store.setSelection({ componentIds: ["cmp_a"], relationshipIds: ["rel_ab"], groupIds: [] });

    expect(duplicateSelection(store)?.ok).toBe(true);
    expect(store.getState().architecture.components[2]).toMatchObject({
      id: "cmp_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "A (copy)",
      position: { x: 24, y: 24 },
    });
    expect(store.getState().architecture.relationships).toHaveLength(2);
    expect(store.getState().selection).toEqual({
      componentIds: ["cmp_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      relationshipIds: [],
      groupIds: [],
    });
  });

  it("groups selected components with a unique name and selects the new group", () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValueOnce("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    const store = createEditorStore(architecture(), () => "edit");
    store.setSelection({ componentIds: ["cmp_a", "cmp_b"], relationshipIds: [], groupIds: [] });

    expect(groupSelection(store)?.ok).toBe(true);
    expect(store.getState().architecture.groups[1]).toMatchObject({
      id: "grp_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      name: "Group 2",
      memberComponentIds: ["cmp_a", "cmp_b"],
    });
    expect(store.getState().selection).toEqual({
      componentIds: [],
      relationshipIds: [],
      groupIds: ["grp_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
    });
  });

  it("ungroups selected components or removes selected group entities", () => {
    const store = createEditorStore(architecture(), () => "edit");
    store.setSelection({ componentIds: ["cmp_a"], relationshipIds: [], groupIds: [] });
    expect(ungroupSelection(store)?.ok).toBe(true);
    expect(store.getState().architecture.groups[0]?.memberComponentIds).toEqual([]);

    store.setSelection({ componentIds: [], relationshipIds: [], groupIds: ["grp_team"] });
    expect(ungroupSelection(store)?.ok).toBe(true);
    expect(store.getState().architecture.groups).toEqual([]);
    expect(store.getState().architecture.components).toHaveLength(2);
  });

  it("nudges selected groups and members together as one coalesced history step", () => {
    let timestamp = 0;
    const store = createEditorStore(architecture(), () => `t-${++timestamp}`);
    store.setSelection({ componentIds: [], relationshipIds: [], groupIds: ["grp_team"] });
    nudgeSelection(store, 8, 0);
    nudgeSelection(store, 8, 0);

    expect(store.getState().architecture.components[0]?.position).toEqual({ x: 16, y: 0 });
    expect(store.getState().architecture.groups[0]?.bounds.x).toBe(-8);
    expect(store.getState().canUndo).toBe(true);
    store.undo();
    expect(store.getState().architecture.components[0]?.position).toEqual({ x: 0, y: 0 });
    expect(store.getState().canUndo).toBe(false);
    expect(store.getState().canRedo).toBe(true);
  });
});
