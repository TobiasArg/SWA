/**
 * Pure drag controller for component and group moves (TD 6.5).
 *
 * 1. `startDrag` computes the moving set: every dragged component plus every
 *    member of every dragged group (deduplicated), and records start positions of
 *    those components and start bounds of the dragged groups.
 * 2. `transientLayout` gives, for a delta of the primary (pointer-held) node,
 *    the live positions of all moving components and the live bounds of every
 *    affected group: groups with members are recomputed from the transient member
 *    positions (so a member dragged outside grows its group), empty dragged
 *    groups translate.
 * 3. `finalMoveCommand` builds ONE `moveElements` with absolute positions for all
 *    moved components and `groupDeltas` for dragged groups, or `null` for a zero
 *    delta (nothing is dispatched).
 *
 * Membership never changes during a drag; it is only read here.
 */
import type { Command } from "../domain/commands";
import { computeGroupBounds } from "../domain/geometry";
import type { Architecture, Component, Position, Rect } from "../domain/types";

export interface DragSession {
  /** The node under the pointer; its position change defines the delta. */
  primaryId: string;
  primaryStart: Position;
  /** Start positions of all moving components (dragged + members of dragged groups). */
  componentStarts: ReadonlyMap<string, Position>;
  /** Start bounds of the dragged groups. */
  groupStarts: ReadonlyMap<string, Rect>;
  /** Groups whose bounds change live: dragged groups and groups containing a moving component. */
  affectedGroupIds: readonly string[];
}

export interface TransientLayout {
  componentPositions: Record<string, Position>;
  groupBounds: Record<string, Rect>;
}

/**
 * Starts a drag session, or returns null when nothing known is dragged.
 * `draggedIds` are the ids React Flow drags (the primary node plus other
 * selected nodes); ids that are neither components nor groups are ignored.
 */
export function startDrag(
  architecture: Architecture,
  primaryId: string,
  draggedIds: Iterable<string>,
): DragSession | null {
  const componentsById = new Map(architecture.components.map((component) => [component.id, component]));
  const groupsById = new Map(architecture.groups.map((group) => [group.id, group]));

  const componentStarts = new Map<string, Position>();
  const groupStarts = new Map<string, Rect>();
  const addComponent = (id: string) => {
    const component = componentsById.get(id);
    if (component && !componentStarts.has(id)) {
      componentStarts.set(id, { x: component.position.x, y: component.position.y });
    }
  };

  const ids = new Set(draggedIds);
  ids.add(primaryId);
  for (const id of ids) {
    const group = groupsById.get(id);
    if (group) {
      if (!groupStarts.has(id)) groupStarts.set(id, { ...group.bounds });
      for (const memberId of group.memberComponentIds) addComponent(memberId);
    } else {
      addComponent(id);
    }
  }

  const primaryComponent = componentsById.get(primaryId);
  const primaryGroup = groupsById.get(primaryId);
  const primaryStart = primaryComponent
    ? { x: primaryComponent.position.x, y: primaryComponent.position.y }
    : primaryGroup
      ? { x: primaryGroup.bounds.x, y: primaryGroup.bounds.y }
      : null;
  if (!primaryStart || (componentStarts.size === 0 && groupStarts.size === 0)) return null;

  const affectedGroupIds = architecture.groups
    .filter(
      (group) => groupStarts.has(group.id) || group.memberComponentIds.some((id) => componentStarts.has(id)),
    )
    .map((group) => group.id);

  return { primaryId, primaryStart, componentStarts, groupStarts, affectedGroupIds };
}

/** Delta of the primary node from its start position. */
export function dragDelta(session: DragSession, primaryPosition: Position): Position {
  return { x: primaryPosition.x - session.primaryStart.x, y: primaryPosition.y - session.primaryStart.y };
}

function translate(position: Position, delta: Position): Position {
  return { x: position.x + delta.x, y: position.y + delta.y };
}

/** Live positions of the moving set and live bounds of the affected groups. */
export function transientLayout(
  architecture: Architecture,
  session: DragSession,
  delta: Position,
): TransientLayout {
  const componentPositions: Record<string, Position> = {};
  for (const [id, start] of session.componentStarts) componentPositions[id] = translate(start, delta);

  const componentsById = new Map(architecture.components.map((component) => [component.id, component]));
  const groupBounds: Record<string, Rect> = {};
  for (const groupId of session.affectedGroupIds) {
    const group = architecture.groups.find((candidate) => candidate.id === groupId);
    if (!group) continue;
    const members: Component[] = [];
    for (const memberId of group.memberComponentIds) {
      const member = componentsById.get(memberId);
      if (!member) continue;
      const position = componentPositions[memberId];
      members.push(position ? { ...member, position } : member);
    }
    if (members.length > 0) {
      groupBounds[groupId] = computeGroupBounds(members);
    } else {
      const start = session.groupStarts.get(groupId);
      if (start) groupBounds[groupId] = { ...start, ...translate(start, delta) };
    }
  }

  return { componentPositions, groupBounds };
}

/** ONE `moveElements` for the whole gesture, or null when nothing moved. */
export function finalMoveCommand(session: DragSession, delta: Position): Command | null {
  if (delta.x === 0 && delta.y === 0) return null;
  if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y)) return null;

  const componentPositions: Record<string, Position> = {};
  for (const [id, start] of session.componentStarts) componentPositions[id] = translate(start, delta);
  const groupDeltas: Record<string, Position> = {};
  for (const id of session.groupStarts.keys()) groupDeltas[id] = { x: delta.x, y: delta.y };

  return { kind: "moveElements", componentPositions, groupDeltas };
}
