import type { Selection } from "../../domain/types";
import { showEntryUndoToast } from "../../editor/actions";
import type { EditorStore } from "../../editor/storeTypes";
import type { ActionFeedback, EditorActions } from "../services";

/** Placeholder for `editor/actions.ts` (WS-A), following TD 5.3. */

function count(n: number, singular: string): string {
  return `${n} ${singular}${n === 1 ? "" : "s"}`;
}

export function deletionMessage(summary: {
  deletedComponents: number;
  deletedRelationships: number;
  deletedGroups: number;
}, singleComponentName?: string): string {
  const parts = [
    summary.deletedComponents
      ? summary.deletedComponents === 1 && singleComponentName
        ? singleComponentName
        : count(summary.deletedComponents, "component")
      : "",
    summary.deletedRelationships ? count(summary.deletedRelationships, "relationship") : "",
    summary.deletedGroups ? count(summary.deletedGroups, "group") : "",
  ].filter(Boolean);
  if (parts.length === 0) return "Nothing was deleted.";
  const last = parts.pop();
  return `Deleted ${parts.length ? `${parts.join(", ")} and ${last}` : last}.`;
}

function select(store: EditorStore, partial: Partial<Selection>): void {
  store.setSelection({ componentIds: [], relationshipIds: [], groupIds: [], ...partial });
}

function reportFailure(result: ReturnType<EditorStore["dispatch"]>, feedback?: ActionFeedback): boolean {
  if (result.ok) return true;
  feedback?.showToast(result.error.message);
  return false;
}

export const placeholderActions: EditorActions = {
  deleteSelection(store, feedback) {
    const { architecture, selection } = store.getState();
    if (!selection.componentIds.length && !selection.relationshipIds.length && !selection.groupIds.length) return;
    const singleComponentName =
      selection.componentIds.length === 1
        ? architecture.components.find((component) => component.id === selection.componentIds[0])?.name
        : undefined;
    const result = store.dispatch({ kind: "deleteElements", ...selection }, { label: "Delete" });
    if (!reportFailure(result, feedback) || !result.ok) return;
    const message = deletionMessage(
      result.summary ?? {
        deletedComponents: selection.componentIds.length,
        deletedRelationships: selection.relationshipIds.length,
        deletedGroups: selection.groupIds.length,
      },
      singleComponentName,
    );
    if (result.entryId !== undefined) showEntryUndoToast(store, feedback, result.entryId, message);
    feedback.announce(message);
  },
  duplicateSelection(store, feedback) {
    const { componentIds } = store.getState().selection;
    if (!componentIds.length) return;
    const items = componentIds.map((sourceId) => ({ sourceId, newId: `cmp_${crypto.randomUUID()}` }));
    const result = store.dispatch({ kind: "duplicateComponents", items }, { label: "Duplicate" });
    if (reportFailure(result, feedback)) select(store, { componentIds: items.map((item) => item.newId) });
  },
  groupSelection(store, feedback) {
    const { architecture, selection } = store.getState();
    if (!selection.componentIds.length) return;
    const names = new Set(architecture.groups.map((group) => group.name));
    let name = "Group";
    for (let n = 2; names.has(name); n += 1) name = `Group ${n}`;
    const id = `grp_${crypto.randomUUID()}`;
    const result = store.dispatch(
      { kind: "createGroup", group: { id, name }, memberIds: selection.componentIds },
      { label: "Group" },
    );
    if (reportFailure(result, feedback)) select(store, { groupIds: [id] });
  },
  ungroupSelection(store, feedback) {
    const { selection } = store.getState();
    if (selection.groupIds.length) {
      reportFailure(
        store.dispatch(
          { kind: "deleteElements", componentIds: [], relationshipIds: [], groupIds: selection.groupIds },
          { label: "Ungroup" },
        ),
        feedback,
      );
    } else if (selection.componentIds.length) {
      reportFailure(
        store.dispatch(
          { kind: "assignToGroup", componentIds: selection.componentIds, groupId: null },
          { label: "Ungroup" },
        ),
        feedback,
      );
    }
  },
  nudgeSelection(store, dx, dy) {
    const { architecture, selection } = store.getState();
    const ids = new Set(selection.componentIds);
    for (const group of architecture.groups) {
      if (selection.groupIds.includes(group.id)) group.memberComponentIds.forEach((id) => ids.add(id));
    }
    const componentPositions: Record<string, { x: number; y: number }> = {};
    for (const component of architecture.components) {
      if (ids.has(component.id)) {
        componentPositions[component.id] = { x: component.position.x + dx, y: component.position.y + dy };
      }
    }
    const groupDeltas: Record<string, { x: number; y: number }> = {};
    for (const groupId of selection.groupIds) groupDeltas[groupId] = { x: dx, y: dy };
    const sortedIds = [...selection.componentIds, ...selection.groupIds].sort();
    if (!sortedIds.length) return;
    store.dispatch(
      { kind: "moveElements", componentPositions, groupDeltas },
      { coalesceKey: `nudge:${sortedIds.join(",")}`, label: "Move" },
    );
  },
};
