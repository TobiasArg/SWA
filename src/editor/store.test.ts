import { describe, expect, it, vi } from "vitest";
import { createEditorStore } from "./store";
import type { Architecture, Component } from "../domain/types";

function component(id: string, name: string): Component {
  return { id, type: "agent", name, position: { x: 0, y: 0 } };
}

function architecture(): Architecture {
  const components = [component("cmp_a", "A"), component("cmp_b", "B")];
  return {
    id: "arch_test",
    name: "Initial architecture",
    createdAt: "2026-10-21T00:00:00Z",
    updatedAt: "2026-10-21T00:00:00Z",
    components,
    relationships: [
      { id: "rel_ab", type: "uses", sourceId: "cmp_a", targetId: "cmp_b", direction: "directed" },
    ],
    groups: [{ id: "grp_team", name: "Team", memberComponentIds: ["cmp_a"], bounds: { x: -24, y: -56, width: 268, height: 136 } }],
  };
}

describe("createEditorStore", () => {
  it("tracks snapshots, timestamps, revisions, undo and redo", () => {
    const timestamps = ["edit-1", "undo-2", "redo-3"];
    const now = vi.fn(() => timestamps.shift() ?? "later");
    const store = createEditorStore(architecture(), now);
    const listener = vi.fn();
    store.subscribe(listener);

    expect(store.getState()).toMatchObject({ canUndo: false, canRedo: false, revision: 0, contentRevision: 0 });
    const dispatched = store.dispatch({ kind: "updateComponent", id: "cmp_a", patch: { name: "Renamed" } });
    expect(dispatched.ok).toBe(true);
    expect(store.getState()).toMatchObject({
      canUndo: true,
      canRedo: false,
      revision: 1,
      contentRevision: 1,
      architecture: { updatedAt: "edit-1" },
    });

    store.undo();
    expect(store.getState().architecture.components[0]?.name).toBe("A");
    expect(store.getState()).toMatchObject({
      canUndo: false,
      canRedo: true,
      revision: 2,
      contentRevision: 2,
      architecture: { updatedAt: "undo-2" },
    });

    store.redo();
    expect(store.getState().architecture.components[0]?.name).toBe("Renamed");
    expect(store.getState()).toMatchObject({
      canUndo: true,
      canRedo: false,
      revision: 3,
      contentRevision: 3,
      architecture: { updatedAt: "redo-3" },
    });
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("coalesces matching field edits into one undo step and breaks on selection changes", () => {
    let timestamp = 0;
    const store = createEditorStore(architecture(), () => `t-${++timestamp}`);
    store.dispatch({ kind: "updateComponent", id: "cmp_a", patch: { name: "A1" } }, { coalesceKey: "cmp_a:name" });
    store.dispatch({ kind: "updateComponent", id: "cmp_a", patch: { name: "A2" } }, { coalesceKey: "cmp_a:name" });
    store.setSelection({ componentIds: ["cmp_b"], relationshipIds: [], groupIds: [] });
    store.dispatch({ kind: "updateComponent", id: "cmp_a", patch: { name: "A3" } }, { coalesceKey: "cmp_a:name" });

    store.undo();
    expect(store.getState().architecture.components[0]?.name).toBe("A2");
    store.undo();
    expect(store.getState().architecture.components[0]?.name).toBe("A");
  });

  it("returns domain errors without changing state", () => {
    const store = createEditorStore(architecture(), () => "should-not-be-used");
    const before = store.getState();
    const result = store.dispatch({ kind: "updateComponent", id: "cmp_a", patch: { name: "  " } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("E_NAME_REQUIRED");
    expect(store.getState()).toBe(before);
  });

  it("prunes unknown and duplicate selection IDs and prunes deletions", () => {
    const store = createEditorStore(architecture(), () => "edit");
    store.setSelection({
      componentIds: ["cmp_a", "missing", "cmp_a"],
      relationshipIds: ["rel_ab", "missing"],
      groupIds: ["grp_team", "missing"],
    });
    expect(store.getState().selection).toEqual({
      componentIds: ["cmp_a"],
      relationshipIds: ["rel_ab"],
      groupIds: ["grp_team"],
    });
    store.dispatch({ kind: "deleteElements", componentIds: ["cmp_a"], relationshipIds: [], groupIds: ["grp_team"] });
    expect(store.getState().selection).toEqual({ componentIds: [], relationshipIds: [], groupIds: [] });
  });

  it("does not make viewport changes undoable or update updatedAt, and preserves view/library metadata on undo", () => {
    let count = 0;
    const store = createEditorStore(architecture(), () => `ts-${++count}`);
    store.dispatch({ kind: "updateComponent", id: "cmp_a", patch: { name: "Edited" } });
    store.renameArchitecture("Renamed architecture");
    store.setArchitectureDescription("Library note");
    const contentRevision = store.getState().contentRevision;
    const timestamp = store.getState().architecture.updatedAt;
    const revision = store.getState().revision;

    store.setViewport({ x: 40, y: -10, zoom: 1.5 });
    expect(store.getState().architecture.updatedAt).toBe(timestamp);
    expect(store.getState().contentRevision).toBe(contentRevision);
    expect(store.getState().revision).toBe(revision + 1);

    store.undo();
    expect(store.getState().architecture.components[0]?.name).toBe("A");
    expect(store.getState().architecture).toMatchObject({
      name: "Renamed architecture",
      description: "Library note",
      updatedAt: "ts-4",
      canvas: { viewport: { x: 40, y: -10, zoom: 1.5 } },
    });
    expect(store.getState().canUndo).toBe(false);
    expect(store.getState().canRedo).toBe(true);
  });

  it("updates timestamps and revisions for non-undoable architecture metadata and validates viewport", () => {
    const store = createEditorStore(architecture(), () => "library-edit");
    store.renameArchitecture("Renamed");
    expect(store.getState()).toMatchObject({ revision: 1, contentRevision: 1, canUndo: false });
    store.setArchitectureDescription("A note");
    expect(store.getState().revision).toBe(2);
    store.setArchitectureDescription("");
    expect(store.getState().architecture.description).toBeUndefined();
    expect(store.getState().revision).toBe(3);
    expect(store.getState().contentRevision).toBe(3);
    store.setViewport({ x: NaN, y: 0, zoom: 1 });
    expect(store.getState().revision).toBe(3);
    expect(store.getState().architecture.canvas).toBeUndefined();
  });

  it("notifies only while subscribed and does not revise state for identical selection/view", () => {
    const store = createEditorStore(architecture(), () => "edit");
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.setSelection({ componentIds: ["cmp_a"], relationshipIds: [], groupIds: [] });
    store.setSelection({ componentIds: ["cmp_a"], relationshipIds: [], groupIds: [] });
    store.setViewport({ x: 0, y: 0, zoom: 1 });
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    store.setSelection({ componentIds: ["cmp_b"], relationshipIds: [], groupIds: [] });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("identifies history entries and undoes a specific entry only while it is the top one", () => {
    const store = createEditorStore(architecture(), () => "edit");
    expect(store.getState().historyHeadId).toBeNull();

    const first = store.dispatch({ kind: "updateComponent", id: "cmp_a", patch: { name: "A1" } }, { coalesceKey: "cmp_a:name" });
    const merged = store.dispatch({ kind: "updateComponent", id: "cmp_a", patch: { name: "A2" } }, { coalesceKey: "cmp_a:name" });
    const firstId = first.ok ? first.entryId : undefined;
    expect(firstId).toEqual(expect.any(Number));
    expect(merged.ok && merged.entryId).toBe(firstId);
    expect(store.getState().historyHeadId).toBe(firstId);

    const unchanged = store.dispatch({ kind: "updateComponent", id: "cmp_a", patch: { name: "A2" } });
    expect(unchanged.ok && unchanged.entryId).toBeUndefined();

    const second = store.dispatch({ kind: "updateComponent", id: "cmp_b", patch: { name: "B1" } });
    const secondId = second.ok ? second.entryId : undefined;
    expect(secondId).not.toBe(firstId);
    expect(store.getState().historyHeadId).toBe(secondId);

    const revision = store.getState().revision;
    expect(store.undoEntry(firstId!)).toBe(false);
    expect(store.getState().revision).toBe(revision);
    expect(store.getState().architecture.components.map((item) => item.name)).toEqual(["A2", "B1"]);

    store.renameArchitecture("Renamed");
    store.setViewport({ x: 10, y: 20, zoom: 1 });
    expect(store.getState().historyHeadId).toBe(secondId);

    expect(store.undoEntry(secondId!)).toBe(true);
    expect(store.getState().architecture).toMatchObject({ name: "Renamed", canvas: { viewport: { x: 10, y: 20, zoom: 1 } } });
    expect(store.getState().architecture.components.map((item) => item.name)).toEqual(["A2", "B"]);
    expect(store.getState().historyHeadId).toBe(firstId);
    expect(store.undoEntry(secondId!)).toBe(false);

    store.redo();
    expect(store.getState().historyHeadId).toBe(secondId);
    store.undo();
    store.undo();
    expect(store.getState().historyHeadId).toBeNull();
    expect(store.undoEntry(firstId!)).toBe(false);
  });
});
