import { createId } from "../domain/ids";
import { createGroup } from "../domain/factories";
import { applyCommand } from "../domain/operations";
import type { Architecture, Position, Selection } from "../domain/types";
import type { DispatchResult, EditorStore } from "./storeTypes";

export interface ActionFeedback {
  showToast(
    message: string,
    options?: { action?: { label: string; onClick: () => void }; durationMs?: number; onClose?: () => void },
  ): number;
  dismissToast(id: number): void;
  announce(message: string): void;
}

export const ENTRY_UNDO_TOAST_MS = 10_000;
export const STALE_UNDO_MESSAGE =
  "Nothing was undone because the diagram changed after the deletion. Use Undo in the toolbar.";

/**
 * Shows a toast whose Undo reverts exactly the history entry `entryId`, or nothing. The toast
 * closes as soon as that entry stops being the top undo entry (a later edit, Undo or Redo), so
 * it can never offer to undo an unrelated change.
 */
export function showEntryUndoToast(
  store: EditorStore,
  feedback: ActionFeedback,
  entryId: number,
  message: string,
  undoneMessage = "Undid the deletion.",
): void {
  let unsubscribe: (() => void) | undefined;
  const stopWatching = () => {
    unsubscribe?.();
    unsubscribe = undefined;
  };
  const toastId = feedback.showToast(message, {
    action: {
      label: "Undo",
      onClick: () => {
        stopWatching();
        feedback.announce(store.undoEntry(entryId) ? undoneMessage : STALE_UNDO_MESSAGE);
      },
    },
    durationMs: ENTRY_UNDO_TOAST_MS,
    onClose: stopWatching,
  });
  if (store.getState().historyHeadId !== entryId) {
    feedback.dismissToast(toastId);
    return;
  }
  unsubscribe = store.subscribe(() => {
    if (store.getState().historyHeadId === entryId) return;
    stopWatching();
    feedback.dismissToast(toastId);
  });
}

function pluralized(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

interface DeletionSummary {
  deletedComponents: number;
  deletedRelationships: number;
  deletedGroups: number;
}

function deletionList(summary: DeletionSummary): string {
  const parts: string[] = [];
  if (summary.deletedComponents > 0) parts.push(pluralized(summary.deletedComponents, "component"));
  if (summary.deletedRelationships > 0) parts.push(pluralized(summary.deletedRelationships, "relationship"));
  if (summary.deletedGroups > 0) parts.push(pluralized(summary.deletedGroups, "group"));
  return parts.join(" and ");
}

function deletionMessage(summary: DeletionSummary): string {
  const list = deletionList(summary);
  return list ? `Deleted ${list}.` : "";
}

/** "delete" removes the selection; "ungroup" removes only the selected groups (members stay). */
export type DeletionIntent = "delete" | "ungroup";

export interface DeletionPreview {
  ids: Selection;
  summary: DeletionSummary;
  /** Relationships removed only because one of their components is. */
  cascadedRelationships: number;
}

/** The IDs `deleteSelection` / `ungroupSelection` would pass to `deleteElements`. */
export function deletionTargets(selection: Selection, intent: DeletionIntent): Selection {
  return intent === "ungroup"
    ? { componentIds: [], relationshipIds: [], groupIds: [...selection.groupIds] }
    : {
        componentIds: [...selection.componentIds],
        relationshipIds: [...selection.relationshipIds],
        groupIds: [...selection.groupIds],
      };
}

/**
 * Runs the `deleteElements` command without dispatching it, so the counts shown before a
 * confirmed delete always equal the real summary (cascaded relationships included). Returns
 * null when the command would delete nothing or be rejected.
 */
export function previewDeletion(architecture: Architecture, ids: Selection): DeletionPreview | null {
  if (!ids.componentIds.length && !ids.relationshipIds.length && !ids.groupIds.length) return null;
  let summary: DeletionSummary | undefined;
  try {
    summary = applyCommand(architecture, { kind: "deleteElements", ...ids }).summary;
  } catch {
    return null;
  }
  if (!summary || !deletionList(summary)) return null;
  return {
    ids,
    summary,
    cascadedRelationships: Math.max(0, summary.deletedRelationships - ids.relationshipIds.length),
  };
}

export interface DeletionConfirmCopy {
  title: string;
  description: string;
  confirmLabel: string;
}

const UNDO_HINT = "You can undo this with Undo or ⌘Z / Ctrl+Z.";

/** Copy for the confirmation that precedes every editor deletion (UI_COLOR_CONFIRMATION_DESIGN §2.3). */
export function deletionConfirmCopy(preview: DeletionPreview, intent: DeletionIntent): DeletionConfirmCopy {
  const { summary } = preview;
  const many = summary.deletedGroups !== 1;
  if (intent === "ungroup") {
    return {
      title: `Ungroup ${pluralized(summary.deletedGroups, "group")}?`,
      description: `${many ? "The groups are" : "The group is"} removed. ${many ? "Their" : "Its"} components stay on the canvas. You can undo this with ⌘Z / Ctrl+Z.`,
      confirmLabel: "Ungroup",
    };
  }
  const groupsOnly = summary.deletedComponents === 0 && summary.deletedRelationships === 0;
  const description = groupsOnly
    ? `${many ? "Their" : "Its"} components stay on the canvas. ${UNDO_HINT}`
    : preview.cascadedRelationships > 0
      ? `Connected relationships are deleted with their components. ${UNDO_HINT}`
      : UNDO_HINT;
  return { title: `Delete ${deletionList(summary)}?`, description, confirmLabel: "Delete" };
}

export function deleteSelection(store: EditorStore, feedback: ActionFeedback): DispatchResult {
  const selection = store.getState().selection;
  const result = store.dispatch({
    kind: "deleteElements",
    componentIds: selection.componentIds,
    relationshipIds: selection.relationshipIds,
    groupIds: selection.groupIds,
  });
  if (!result.ok || !result.summary) return result;

  const message = deletionMessage(result.summary);
  if (!message || result.entryId === undefined) return result;
  showEntryUndoToast(store, feedback, result.entryId, message);
  feedback.announce(message);
  return result;
}

export function duplicateSelection(store: EditorStore): DispatchResult | undefined {
  const { selection } = store.getState();
  if (selection.componentIds.length === 0) return undefined;
  const newIds = selection.componentIds.map(() => createId("cmp"));
  const result = store.dispatch({
    kind: "duplicateComponents",
    items: selection.componentIds.map((sourceId, index) => ({
      sourceId,
      newId: newIds[index] as string,
    })),
  });
  if (result.ok) {
    store.setSelection({
      componentIds: newIds,
      relationshipIds: [],
      groupIds: [],
    });
  }
  return result;
}

function nextGroupName(names: string[]): string {
  const existing = new Set(names);
  if (!existing.has("Group")) return "Group";
  let suffix = 2;
  while (existing.has(`Group ${suffix}`)) suffix += 1;
  return `Group ${suffix}`;
}

export function groupSelection(store: EditorStore): DispatchResult | undefined {
  const { architecture, selection } = store.getState();
  if (selection.componentIds.length === 0) return undefined;

  const group = createGroup(nextGroupName(architecture.groups.map((candidate) => candidate.name)));
  const result = store.dispatch({
    kind: "createGroup",
    group: { id: group.id, name: group.name },
    memberIds: selection.componentIds,
  });
  if (result.ok) {
    store.setSelection({ componentIds: [], relationshipIds: [], groupIds: [group.id] });
  }
  return result;
}

export function ungroupSelection(store: EditorStore): DispatchResult | undefined {
  const { selection } = store.getState();
  if (selection.groupIds.length > 0) {
    return store.dispatch({
      kind: "deleteElements",
      componentIds: [],
      relationshipIds: [],
      groupIds: selection.groupIds,
    });
  }
  if (selection.componentIds.length === 0) return undefined;
  return store.dispatch({
    kind: "assignToGroup",
    componentIds: selection.componentIds,
    groupId: null,
  });
}

export function nudgeSelection(store: EditorStore, dx: number, dy: number): DispatchResult | undefined {
  if (dx === 0 && dy === 0) return undefined;
  const { architecture, selection } = store.getState();
  if (selection.componentIds.length === 0 && selection.groupIds.length === 0) return undefined;

  const movedComponentIds = new Set(selection.componentIds);
  for (const groupId of selection.groupIds) {
    const group = architecture.groups.find((candidate) => candidate.id === groupId);
    for (const memberId of group?.memberComponentIds ?? []) movedComponentIds.add(memberId);
  }

  const componentPositions: Record<string, Position> = {};
  for (const component of architecture.components) {
    if (movedComponentIds.has(component.id)) {
      componentPositions[component.id] = {
        x: component.position.x + dx,
        y: component.position.y + dy,
      };
    }
  }
  const groupDeltas: Record<string, Position> = {};
  for (const groupId of selection.groupIds) groupDeltas[groupId] = { x: dx, y: dy };

  const movementIds = [...movedComponentIds, ...selection.groupIds].sort();
  return store.dispatch(
    { kind: "moveElements", componentPositions, groupDeltas },
    { coalesceKey: `nudge:${movementIds.join(",")}` },
  );
}
