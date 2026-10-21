import { createId } from "../domain/ids";
import { createGroup } from "../domain/factories";
import type { Position } from "../domain/types";
import type { DispatchResult, EditorStore } from "./storeTypes";

export interface ActionFeedback {
  showToast(
    message: string,
    options?: { action?: { label: string; onClick: () => void }; durationMs?: number },
  ): unknown;
  announce(message: string): void;
}

function pluralized(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function deletionMessage(summary: {
  deletedComponents: number;
  deletedRelationships: number;
  deletedGroups: number;
}): string {
  const parts: string[] = [];
  if (summary.deletedComponents > 0) parts.push(pluralized(summary.deletedComponents, "component"));
  if (summary.deletedRelationships > 0) parts.push(pluralized(summary.deletedRelationships, "relationship"));
  if (summary.deletedGroups > 0) parts.push(pluralized(summary.deletedGroups, "group"));
  return parts.length === 0 ? "" : `Deleted ${parts.join(" and ")}.`;
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
  if (!message) return result;
  feedback.showToast(message, { action: { label: "Undo", onClick: () => store.undo() } });
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
