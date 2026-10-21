/**
 * Selection sync between React Flow and the editor store (TD 6.6). The store
 * selection is the source of truth; React Flow `select` changes are translated
 * into a new store selection, split into component / group / relationship IDs.
 */
import type { EdgeSelectionChange, NodeSelectionChange } from "@xyflow/react";
import type { Architecture, Selection } from "../domain/types";

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export function selectionsEqual(a: Selection, b: Selection): boolean {
  return (
    sameIds(a.componentIds, b.componentIds) &&
    sameIds(a.relationshipIds, b.relationshipIds) &&
    sameIds(a.groupIds, b.groupIds)
  );
}

/**
 * Applies React Flow select changes to the current store selection. Returns the
 * new selection, or `null` when nothing changed. Unknown IDs are ignored.
 */
export function applySelectionChanges(
  architecture: Architecture,
  current: Selection,
  nodeChanges: readonly NodeSelectionChange[],
  edgeChanges: readonly EdgeSelectionChange[],
): Selection | null {
  const groupIds = new Set(architecture.groups.map((group) => group.id));
  const componentIds = new Set(architecture.components.map((component) => component.id));
  const relationshipIds = new Set(architecture.relationships.map((rel) => rel.id));

  const components = new Set(current.componentIds);
  const groups = new Set(current.groupIds);
  const relationships = new Set(current.relationshipIds);

  for (const change of nodeChanges) {
    const target = groupIds.has(change.id) ? groups : componentIds.has(change.id) ? components : null;
    if (!target) continue;
    if (change.selected) target.add(change.id);
    else target.delete(change.id);
  }
  for (const change of edgeChanges) {
    if (!relationshipIds.has(change.id)) continue;
    if (change.selected) relationships.add(change.id);
    else relationships.delete(change.id);
  }

  const next: Selection = {
    componentIds: [...components],
    relationshipIds: [...relationships],
    groupIds: [...groups],
  };
  return selectionsEqual(current, next) ? null : next;
}

/**
 * Keyboard selection (Enter/Space) of the focused React Flow node or edge.
 * `target` must be the node/edge element itself (not something inside it).
 * With `additive`, the element is toggled in the current selection.
 */
export function selectionFromFocusedElement(
  architecture: Architecture,
  current: Selection,
  target: EventTarget | null,
  additive: boolean,
): Selection | null {
  if (!(target instanceof Element)) return null;
  const isNode = target.classList.contains("react-flow__node");
  const isEdge = target.classList.contains("react-flow__edge");
  if (!isNode && !isEdge) return null;
  const id = target.getAttribute("data-id");
  if (!id) return null;

  let key: keyof Selection | null = null;
  if (isEdge && architecture.relationships.some((rel) => rel.id === id)) key = "relationshipIds";
  else if (isNode && architecture.groups.some((group) => group.id === id)) key = "groupIds";
  else if (isNode && architecture.components.some((component) => component.id === id)) key = "componentIds";
  if (!key) return null;

  if (!additive) {
    const next: Selection = { componentIds: [], relationshipIds: [], groupIds: [] };
    next[key] = [id];
    return selectionsEqual(current, next) ? null : next;
  }

  const ids = current[key];
  const next: Selection = {
    ...current,
    [key]: ids.includes(id) ? ids.filter((existing) => existing !== id) : [...ids, id],
  };
  return next;
}
