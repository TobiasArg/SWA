import { describe, expect, it, vi } from "vitest";
import { createEditorStore } from "./store";
import {
  ENTRY_UNDO_TOAST_MS,
  STALE_UNDO_MESSAGE,
  deleteSelection,
  deletionConfirmCopy,
  deletionTargets,
  duplicateSelection,
  groupSelection,
  nudgeSelection,
  previewDeletion,
  ungroupSelection,
} from "./actions";
import type { Architecture, Component } from "../domain/types";
import type { ActionFeedback } from "./actions";

function createFeedback() {
  let nextToastId = 0;
  return {
    showToast: vi.fn<ActionFeedback["showToast"]>(() => ++nextToastId),
    dismissToast: vi.fn<ActionFeedback["dismissToast"]>(),
    announce: vi.fn<ActionFeedback["announce"]>(),
  };
}

type ToastOptions = NonNullable<Parameters<ActionFeedback["showToast"]>[1]>;

function toastOptions(feedback: ReturnType<typeof createFeedback>, call = 0): ToastOptions {
  return feedback.showToast.mock.calls[call]?.[1] as ToastOptions;
}

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
    const feedback = createFeedback();
    const { showToast, announce } = feedback;

    const result = deleteSelection(store, feedback);
    const message = "Deleted 1 component and 2 relationships.";
    expect(result.ok).toBe(true);
    expect(store.getState().architecture.components.map((item) => item.id)).toEqual(["cmp_b"]);
    expect(store.getState().architecture.relationships).toEqual([]);
    expect(store.getState().architecture.groups[0]?.memberComponentIds).toEqual([]);
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(message, {
      action: { label: "Undo", onClick: expect.any(Function) },
      durationMs: ENTRY_UNDO_TOAST_MS,
      onClose: expect.any(Function),
    });
    expect(announce).toHaveBeenCalledWith(message);

    toastOptions(feedback).action!.onClick();
    expect(announce).toHaveBeenLastCalledWith("Undid the deletion.");
    expect(store.getState().architecture.components.map((item) => item.id)).toEqual(["cmp_a", "cmp_b"]);
    expect(store.getState().architecture.relationships).toHaveLength(2);
    expect(store.getState().architecture.groups[0]?.memberComponentIds).toEqual(["cmp_a"]);
  });

  it("does not show deletion feedback when the selection is empty", () => {
    const store = createEditorStore(architecture(), () => "edit");
    const feedback = createFeedback();
    deleteSelection(store, feedback);
    expect(feedback.showToast).not.toHaveBeenCalled();
    expect(feedback.announce).not.toHaveBeenCalled();
  });

  describe("deletion Undo toast bound to its history entry", () => {
    it("dismisses the toast on a later edit, and a stale Undo changes nothing", () => {
      const store = createEditorStore(architecture(), () => "edit");
      store.setSelection({ componentIds: ["cmp_a"], relationshipIds: [], groupIds: [] });
      const feedback = createFeedback();
      deleteSelection(store, feedback);
      const toastId = feedback.showToast.mock.results[0]?.value as number;

      store.setSelection({ componentIds: ["cmp_b"], relationshipIds: [], groupIds: [] });
      store.renameArchitecture("Renamed");
      store.setViewport({ x: 5, y: 5, zoom: 1 });
      expect(feedback.dismissToast).not.toHaveBeenCalled();

      store.dispatch({ kind: "moveElements", componentPositions: { cmp_b: { x: 300, y: 40 } }, groupDeltas: {} });
      nudgeSelection(store, 8, 0);
      expect(feedback.dismissToast).toHaveBeenCalledTimes(1);
      expect(feedback.dismissToast).toHaveBeenCalledWith(toastId);

      const before = store.getState();
      toastOptions(feedback).action!.onClick();
      expect(store.getState()).toBe(before);
      expect(store.getState().architecture.components.map((item) => item.id)).toEqual(["cmp_b"]);
      expect(feedback.announce).toHaveBeenLastCalledWith(STALE_UNDO_MESSAGE);
    });

    it("dismisses the toast when Undo elsewhere already reverted the deletion", () => {
      const store = createEditorStore(architecture(), () => "edit");
      store.setSelection({ componentIds: ["cmp_a"], relationshipIds: [], groupIds: [] });
      const feedback = createFeedback();
      deleteSelection(store, feedback);

      store.undo();
      expect(feedback.dismissToast).toHaveBeenCalledTimes(1);
      store.redo();
      expect(feedback.dismissToast).toHaveBeenCalledTimes(1);
    });

    it("binds each deletion toast to its own entry", () => {
      const store = createEditorStore(architecture(), () => "edit");
      const feedback = createFeedback();
      store.setSelection({ componentIds: ["cmp_a"], relationshipIds: [], groupIds: [] });
      deleteSelection(store, feedback);
      store.setSelection({ componentIds: ["cmp_b"], relationshipIds: [], groupIds: [] });
      deleteSelection(store, feedback);
      expect(feedback.dismissToast).toHaveBeenCalledExactlyOnceWith(1);

      toastOptions(feedback, 0).action!.onClick();
      expect(store.getState().architecture.components).toEqual([]);
      expect(feedback.announce).toHaveBeenLastCalledWith(STALE_UNDO_MESSAGE);
      toastOptions(feedback, 1).action!.onClick();
      expect(store.getState().architecture.components.map((item) => item.id)).toEqual(["cmp_b"]);
      expect(feedback.announce).toHaveBeenLastCalledWith("Undid the deletion.");
    });

    it("stops watching the store once the toast closes", () => {
      const store = createEditorStore(architecture(), () => "edit");
      store.setSelection({ componentIds: ["cmp_a"], relationshipIds: [], groupIds: [] });
      const feedback = createFeedback();
      deleteSelection(store, feedback);

      toastOptions(feedback).onClose!();
      store.dispatch({ kind: "moveElements", componentPositions: { cmp_b: { x: 300, y: 40 } }, groupDeltas: {} });
      expect(feedback.dismissToast).not.toHaveBeenCalled();
    });
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

  describe("deletion preview and confirmation copy", () => {
    const none = { componentIds: [], relationshipIds: [], groupIds: [] };

    it("previews the same counts the dispatched deletion reports, cascaded relationships included", () => {
      const cases = [
        { ...none, componentIds: ["cmp_a"] },
        { ...none, relationshipIds: ["rel_ab"] },
        { ...none, componentIds: ["cmp_a"], relationshipIds: ["rel_ab"] },
        { ...none, groupIds: ["grp_team"] },
        { componentIds: ["cmp_a", "cmp_b"], relationshipIds: ["rel_ba"], groupIds: ["grp_team"] },
      ];
      for (const selection of cases) {
        const before = architecture();
        const preview = previewDeletion(before, selection);
        expect(before).toEqual(architecture());

        const store = createEditorStore(architecture(), () => "edit");
        store.setSelection(selection);
        const result = deleteSelection(store, createFeedback());
        expect(result.ok && result.summary).toEqual(preview?.summary);
      }
    });

    it("previews nothing for an empty selection or a rejected command", () => {
      expect(previewDeletion(architecture(), none)).toBeNull();
      expect(previewDeletion(architecture(), { ...none, componentIds: ["cmp_missing"] })).toBeNull();
    });

    it("targets only the selected groups for ungroup", () => {
      const selection = { componentIds: ["cmp_a"], relationshipIds: ["rel_ab"], groupIds: ["grp_team"] };
      expect(deletionTargets(selection, "delete")).toEqual(selection);
      expect(deletionTargets(selection, "ungroup")).toEqual({ ...none, groupIds: ["grp_team"] });
    });

    it("names what will be deleted and how to undo it", () => {
      const cascade = previewDeletion(architecture(), { ...none, componentIds: ["cmp_a"] })!;
      expect(cascade.cascadedRelationships).toBe(2);
      expect(deletionConfirmCopy(cascade, "delete")).toEqual({
        title: "Delete 1 component and 2 relationships?",
        description:
          "Connected relationships are deleted with their components. You can undo this with Undo or ⌘Z / Ctrl+Z.",
        confirmLabel: "Delete",
      });

      const relationship = previewDeletion(architecture(), { ...none, relationshipIds: ["rel_ab"] })!;
      expect(deletionConfirmCopy(relationship, "delete")).toEqual({
        title: "Delete 1 relationship?",
        description: "You can undo this with Undo or ⌘Z / Ctrl+Z.",
        confirmLabel: "Delete",
      });

      const group = previewDeletion(architecture(), { ...none, groupIds: ["grp_team"] })!;
      expect(deletionConfirmCopy(group, "delete")).toEqual({
        title: "Delete 1 group?",
        description: "Its components stay on the canvas. You can undo this with Undo or ⌘Z / Ctrl+Z.",
        confirmLabel: "Delete",
      });
      expect(deletionConfirmCopy(group, "ungroup")).toEqual({
        title: "Ungroup 1 group?",
        description:
          "The group is removed. Its components stay on the canvas. You can undo this with ⌘Z / Ctrl+Z.",
        confirmLabel: "Ungroup",
      });
    });

    it("keeps the confirmation copy as plain text even for markup-like names", () => {
      const arch = architecture();
      arch.components[0]!.name = "<img src=x onerror=alert(1)>";
      const preview = previewDeletion(arch, { ...none, componentIds: ["cmp_a"] })!;
      expect(deletionConfirmCopy(preview, "delete").title).toBe("Delete 1 component and 2 relationships?");
    });
  });
});
