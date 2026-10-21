import { DEFAULT_SIZE, GROUP_HEADER, GROUP_PADDING } from "./constants";
import type { Architecture, Component, Group, Rect, Size } from "./types";

export function effectiveSize(component: Component): Size {
  return component.size ?? DEFAULT_SIZE[component.type];
}

export function componentRect(component: Component): Rect {
  const size = effectiveSize(component);
  return {
    x: component.position.x,
    y: component.position.y,
    width: size.width,
    height: size.height,
  };
}

export function computeGroupBounds(members: Component[]): Rect {
  if (members.length === 0) {
    throw new RangeError("computeGroupBounds requires at least one member.");
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const member of members) {
    const rect = componentRect(member);
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }

  return {
    x: minX - GROUP_PADDING,
    y: minY - GROUP_PADDING - GROUP_HEADER,
    width: maxX - minX + GROUP_PADDING * 2,
    height: maxY - minY + GROUP_PADDING * 2 + GROUP_HEADER,
  };
}

export function recomputeGroupBounds(
  architecture: Architecture,
  groupIds: Iterable<string>,
): Architecture {
  const idsToRecompute = new Set(groupIds);
  if (idsToRecompute.size === 0) return architecture;

  let changed = false;
  const groups = architecture.groups.map((group): Group => {
    if (!idsToRecompute.has(group.id)) return group;

    const memberIds = new Set(group.memberComponentIds);
    const members = architecture.components.filter((component) => memberIds.has(component.id));
    if (members.length === 0) return group;

    const bounds = computeGroupBounds(members);
    if (
      bounds.x === group.bounds.x &&
      bounds.y === group.bounds.y &&
      bounds.width === group.bounds.width &&
      bounds.height === group.bounds.height
    ) {
      return group;
    }

    changed = true;
    return { ...group, bounds };
  });

  return changed ? { ...architecture, groups } : architecture;
}
