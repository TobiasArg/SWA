import { GROUP_HEADER, GROUP_PADDING } from "./constants";
import { componentRect, computeGroupBounds } from "./geometry";
import type { Component, Group, Position, Rect, Selection } from "./types";

export const ALIGN_MODES = ["left", "centers", "right", "top", "middles", "bottom"] as const;
export type AlignMode = (typeof ALIGN_MODES)[number];

export const ARRANGE_AXES = ["horizontal", "vertical"] as const;
export type ArrangeAxis = (typeof ARRANGE_AXES)[number];

export interface MoveElements {
  componentPositions: Record<string, Position>;
  groupDeltas: Record<string, Position>;
}

export type TidyScopeKind = "selection" | "diagram";

export interface TidyScope {
  kind: TidyScopeKind;
  unitCount: number;
}

interface ArrangeUnit {
  id: string;
  kind: "component" | "group";
  rect: Rect;
  memberIds: string[];
}

const INTERNAL_GAP = 40;
const SHELF_GAP = 64;
const SHELF_ROW_WIDTH_FACTOR = 1.6;
const READ_ORDER_ROW_HEIGHT = 80;

function roundPixel(value: number): number {
  const rounded = Math.round(value);
  return Object.is(rounded, -0) ? 0 : rounded;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareNumber(left: number, right: number): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function centerX(rect: Rect): number {
  return rect.x + rect.width / 2;
}

function centerY(rect: Rect): number {
  return rect.y + rect.height / 2;
}

function readingOrder(left: ArrangeUnit, right: ArrangeUnit): number {
  return (
    compareNumber(Math.round(centerY(left.rect) / READ_ORDER_ROW_HEIGHT), Math.round(centerY(right.rect) / READ_ORDER_ROW_HEIGHT)) ||
    compareNumber(centerX(left.rect), centerX(right.rect)) ||
    compareText(left.id, right.id)
  );
}

function componentMap(components: Component[]): Map<string, Component> {
  return new Map(components.map((component) => [component.id, component]));
}

function selectedUnits(components: Component[], groups: Group[], selection: Selection): ArrangeUnit[] {
  const selectedGroups = groups.filter((group) => selection.groupIds.includes(group.id));
  const membersOfSelectedGroups = new Set(selectedGroups.flatMap((group) => group.memberComponentIds));
  const units: ArrangeUnit[] = selectedGroups.map((group) => ({
    id: group.id,
    kind: "group",
    rect: { ...group.bounds },
    memberIds: [...group.memberComponentIds],
  }));

  for (const component of components) {
    if (!selection.componentIds.includes(component.id) || membersOfSelectedGroups.has(component.id)) continue;
    units.push({ id: component.id, kind: "component", rect: componentRect(component), memberIds: [] });
  }
  return units;
}

function diagramUnits(components: Component[], groups: Group[]): ArrangeUnit[] {
  const groupMemberIds = new Set(groups.flatMap((group) => group.memberComponentIds));
  const units: ArrangeUnit[] = groups.map((group) => ({
    id: group.id,
    kind: "group",
    rect: { ...group.bounds },
    memberIds: [...group.memberComponentIds],
  }));

  for (const component of components) {
    if (groupMemberIds.has(component.id)) continue;
    units.push({ id: component.id, kind: "component", rect: componentRect(component), memberIds: [] });
  }
  return units;
}

function isActuallyEmptySelection(selection: Selection): boolean {
  return selection.componentIds.length === 0 && selection.relationshipIds.length === 0 && selection.groupIds.length === 0;
}

/** Count selected geometric units. Relationship IDs deliberately do not add units. */
export function countArrangeUnits(components: Component[], groups: Group[], selection: Selection): number {
  return selectedUnits(components, groups, selection).length;
}

/**
 * Describe the units that Tidy would arrange. Only a truly empty selection opts into
 * the whole diagram; a relationship-only or stale-ID selection remains selection-scoped.
 */
export function getTidyScope(components: Component[], groups: Group[], selection: Selection): TidyScope {
  if (isActuallyEmptySelection(selection)) {
    return { kind: "diagram", unitCount: diagramUnits(components, groups).length };
  }
  return { kind: "selection", unitCount: selectedUnits(components, groups, selection).length };
}

function selectionUnits(components: Component[], groups: Group[], selection: Selection): ArrangeUnit[] {
  return selectedUnits(components, groups, selection);
}

function unionRect(units: ArrangeUnit[]): Rect {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  for (const unit of units) {
    left = Math.min(left, unit.rect.x);
    top = Math.min(top, unit.rect.y);
    right = Math.max(right, unit.rect.x + unit.rect.width);
    bottom = Math.max(bottom, unit.rect.y + unit.rect.height);
  }

  return { x: left, y: top, width: right - left, height: bottom - top };
}

function pixelAlignedWithinRounding(units: ArrangeUnit[], mode: AlignMode): boolean {
  const horizontal = mode === "left" || mode === "centers" || mode === "right";
  const starts = units.map((unit) => horizontal ? unit.rect.x : unit.rect.y);
  if (!starts.every(Number.isInteger)) return false;

  let values: number[];
  let tolerance: number;
  if (mode === "left" || mode === "top") {
    values = starts;
    tolerance = 0;
  } else if (mode === "right" || mode === "bottom") {
    values = units.map((unit) => {
      const size = horizontal ? unit.rect.width : unit.rect.height;
      return (horizontal ? unit.rect.x : unit.rect.y) + size;
    });
    const sizes = units.map((unit) => horizontal ? unit.rect.width : unit.rect.height);
    tolerance = sizes.some((size) => !Number.isInteger(size)) ? 1 : 0;
  } else {
    values = units.map((unit) => horizontal ? centerX(unit.rect) : centerY(unit.rect));
    const sizes = units.map((unit) => horizontal ? unit.rect.width : unit.rect.height);
    tolerance = sizes.some((size) => !Number.isInteger(size)) ? 1 : 0.5;
  }

  return Math.max(...values) - Math.min(...values) <= tolerance;
}

/**
 * Align selected geometric units. A selected group is translated rigidly, and its
 * members are expressed as absolute component positions for the existing move command.
 */
export function align(
  components: Component[],
  groups: Group[],
  selection: Selection,
  mode: AlignMode,
): MoveElements | null {
  const units = selectionUnits(components, groups, selection);
  if (units.length < 2) return null;
  if (pixelAlignedWithinRounding(units, mode)) return null;

  const componentById = componentMap(components);
  const initialRects = new Map(units.map((unit) => [unit.id, { ...unit.rect }]));
  const originalPositions = new Map(components.map((component) => [component.id, { ...component.position }]));
  const positions = new Map([...originalPositions].map(([id, position]) => [id, { ...position }]));

  const bounds = unionRect(units);
  for (const unit of units) {
    let target: number;
    if (mode === "left") target = bounds.x;
    else if (mode === "centers") target = centerX(bounds) - unit.rect.width / 2;
    else if (mode === "right") target = bounds.x + bounds.width - unit.rect.width;
    else if (mode === "top") target = bounds.y;
    else if (mode === "middles") target = centerY(bounds) - unit.rect.height / 2;
    else target = bounds.y + bounds.height - unit.rect.height;

    const snappedTarget = roundPixel(target);
    const isHorizontal = mode === "left" || mode === "centers" || mode === "right";
    const currentStart = isHorizontal ? unit.rect.x : unit.rect.y;
    if (currentStart === snappedTarget) continue;

    if (unit.kind === "component") {
      const component = componentById.get(unit.id)!;
      const current = positions.get(unit.id)!;
      positions.set(unit.id, isHorizontal
        ? { x: snappedTarget, y: current.y }
        : { x: current.x, y: snappedTarget });
      unit.rect = componentRect({ ...component, position: positions.get(unit.id)! });
    } else if (unit.memberIds.length === 0) {
      if (isHorizontal) unit.rect.x = snappedTarget;
      else unit.rect.y = snappedTarget;
    } else {
      const group = groups.find((candidate) => candidate.id === unit.id)!;
      const currentRect = rectForGroup(group, componentById, positions, new Map());
      const delta = snappedTarget - (isHorizontal ? currentRect.x : currentRect.y);
      translatedPositions(unit.memberIds, positions, isHorizontal ? delta : 0, isHorizontal ? 0 : delta);
      unit.rect = rectForGroup(group, componentById, positions, new Map());
    }
  }

  const componentPositions: Record<string, Position> = {};
  const groupDeltas: Record<string, Position> = {};
  for (const unit of units) {
    const before = initialRects.get(unit.id);
    if (!before) continue;
    if (unit.kind === "group" && unit.memberIds.length === 0) {
      const dx = unit.rect.x - before.x;
      const dy = unit.rect.y - before.y;
      if (dx !== 0 || dy !== 0) groupDeltas[unit.id] = { x: dx, y: dy };
    }
  }
  for (const [id, position] of positions) {
    const original = originalPositions.get(id)!;
    if (position.x !== original.x || position.y !== original.y) componentPositions[id] = position;
  }

  return Object.keys(componentPositions).length === 0 && Object.keys(groupDeltas).length === 0
    ? null
    : { componentPositions, groupDeltas };
}

function axisValues(rect: Rect, axis: ArrangeAxis): { start: number; end: number; size: number; center: number } {
  if (axis === "horizontal") {
    return { start: rect.x, end: rect.x + rect.width, size: rect.width, center: centerX(rect) };
  }
  return { start: rect.y, end: rect.y + rect.height, size: rect.height, center: centerY(rect) };
}

function alreadyDistributed(ordered: ArrangeUnit[], axis: ArrangeAxis): boolean {
  const values = ordered.map((unit) => axisValues(unit.rect, axis));
  const first = values[0]!;
  const last = values[values.length - 1]!;
  const span = last.end - first.start;
  const sizeSum = values.reduce((sum, value) => sum + value.size, 0);
  const gap = (span - sizeSum) / (ordered.length - 1);

  if (gap < 0) {
    const centerGap = (last.center - first.center) / (ordered.length - 1);
    return values.slice(1).every((value, index) =>
      Math.abs((value.center - values[index]!.center) - centerGap) <= 1,
    );
  }

  const gaps = values.slice(1).map((value, index) => value.start - values[index]!.end);
  return gaps.every((value) => Math.abs(value - gap) <= 1);
}

/** Distribute selected units once in their initial center/id order, keeping endpoints fixed. */
export function distribute(
  components: Component[],
  groups: Group[],
  selection: Selection,
  axis: ArrangeAxis,
): MoveElements | null {
  const units = selectionUnits(components, groups, selection);
  if (units.length < 3) return null;

  // Sort once: these endpoint identities remain fixed even after pixel rounding.
  const ordered = [...units].sort((left, right) => {
    const a = axisValues(left.rect, axis);
    const b = axisValues(right.rect, axis);
    return compareNumber(a.center, b.center) || compareText(left.id, right.id);
  });
  if (alreadyDistributed(ordered, axis)) return null;

  const initialRects = new Map(units.map((unit) => [unit.id, { ...unit.rect }]));
  const componentById = componentMap(components);
  const originalPositions = new Map(components.map((component) => [component.id, { ...component.position }]));
  const positions = new Map([...originalPositions].map(([id, position]) => [id, { ...position }]));
  const emptyGroupBounds = new Map(
    groups.filter((group) => group.memberComponentIds.length === 0).map((group) => [group.id, { ...group.bounds }]),
  );

  const firstValues = axisValues(ordered[0]!.rect, axis);
  const lastValues = axisValues(ordered[ordered.length - 1]!.rect, axis);
  const gap = (
    lastValues.end - firstValues.start -
    ordered.reduce((sum, unit) => sum + axisValues(unit.rect, axis).size, 0)
  ) / (ordered.length - 1);
  const overlapping = gap < 0;
  let idealStart = firstValues.start;

  for (let index = 1; index < ordered.length - 1; index += 1) {
    const unit = ordered[index]!;
    const values = axisValues(unit.rect, axis);
    let target: number;
    if (overlapping) {
      const targetCenter = firstValues.center +
        ((lastValues.center - firstValues.center) * index) / (ordered.length - 1);
      target = targetCenter - values.size / 2;
    } else {
      // Keep the cursor ideal (fractional); never feed a rounded placement into
      // the next item's calculation.
      idealStart += axisValues(ordered[index - 1]!.rect, axis).size + gap;
      target = idealStart;
    }
    const snappedTarget = roundPixel(target);

    if (unit.kind === "component") {
      const current = positions.get(unit.id)!;
      const position = axis === "horizontal"
        ? { x: snappedTarget, y: current.y }
        : { x: current.x, y: snappedTarget };
      positions.set(unit.id, position);
    } else {
      const group = groups.find((candidate) => candidate.id === unit.id)!;
      if (unit.memberIds.length === 0) {
        const bounds = emptyGroupBounds.get(group.id)!;
        emptyGroupBounds.set(group.id, axis === "horizontal"
          ? { ...bounds, x: snappedTarget }
          : { ...bounds, y: snappedTarget });
      } else {
        const currentRect = rectForGroup(group, componentById, positions, emptyGroupBounds);
        const delta = snappedTarget - axisValues(currentRect, axis).start;
        translatedPositions(unit.memberIds, positions, axis === "horizontal" ? delta : 0, axis === "vertical" ? delta : 0);
      }
    }
  }

  const componentPositions: Record<string, Position> = {};
  const groupDeltas: Record<string, Position> = {};
  for (const unit of units) {
    const before = initialRects.get(unit.id)!;
    if (unit.kind === "group" && unit.memberIds.length === 0) {
      const bounds = emptyGroupBounds.get(unit.id)!;
      const dx = bounds.x - before.x;
      const dy = bounds.y - before.y;
      if (dx !== 0 || dy !== 0) groupDeltas[unit.id] = { x: dx, y: dy };
    }
  }
  for (const [id, position] of positions) {
    const original = originalPositions.get(id)!;
    if (position.x !== original.x || position.y !== original.y) componentPositions[id] = position;
  }

  return Object.keys(componentPositions).length === 0 && Object.keys(groupDeltas).length === 0
    ? null
    : { componentPositions, groupDeltas };
}

function rectForGroup(
  group: Group,
  componentById: Map<string, Component>,
  positions: Map<string, Position>,
  emptyGroupBounds: Map<string, Rect>,
): Rect {
  const members = group.memberComponentIds.flatMap((id) => {
    const component = componentById.get(id);
    const position = positions.get(id);
    return component && position ? [{ ...component, position }] : [];
  });
  if (members.length > 0) return computeGroupBounds(members);
  return { ...(emptyGroupBounds.get(group.id) ?? group.bounds) };
}

function translatedPositions(
  ids: string[],
  positions: Map<string, Position>,
  dx: number,
  dy: number,
): void {
  for (const id of ids) {
    const current = positions.get(id);
    if (!current) continue;
    positions.set(id, { x: current.x + dx, y: current.y + dy });
  }
}

function rectsEqual(left: Rect, right: Rect): boolean {
  return left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height;
}

/** Recognize the grid geometry produced by one internal group pack, independent of read-order ties. */
function groupMembersAlreadyPacked(group: Group, components: Component[]): boolean {
  if (group.memberComponentIds.length === 0) return true;

  const byId = componentMap(components);
  const members = group.memberComponentIds.flatMap((id) => {
    const member = byId.get(id);
    return member ? [member] : [];
  });
  if (members.length !== group.memberComponentIds.length) return false;
  if (!rectsEqual(group.bounds, computeGroupBounds(members))) return false;

  const columns = Math.ceil(Math.sqrt(members.length));
  const rows = Math.ceil(members.length / columns);
  const byCenter = (axis: ArrangeAxis): Component[][] => {
    const centerOf = (member: Component) => axisValues(componentRect(member), axis).center;
    const sorted = [...members].sort((left, right) =>
      compareNumber(centerOf(left), centerOf(right)) || compareText(left.id, right.id),
    );
    const clusters: Component[][] = [];
    for (const member of sorted) {
      const cluster = clusters.at(-1);
      if (!cluster || centerOf(member) - centerOf(cluster[0]!) > 1) clusters.push([member]);
      else cluster.push(member);
    }
    return clusters;
  };
  const columnMembers = byCenter("horizontal");
  const rowMembers = byCenter("vertical");
  if (columnMembers.length !== columns || rowMembers.length !== rows) return false;

  const columnCenters = columnMembers.map((cluster) =>
    cluster.reduce((sum, member) => sum + centerX(componentRect(member)), 0) / cluster.length,
  );
  const rowCenters = rowMembers.map((cluster) =>
    cluster.reduce((sum, member) => sum + centerY(componentRect(member)), 0) / cluster.length,
  );
  const columnWidths = columnMembers.map((cluster) =>
    Math.max(...cluster.map((member) => componentRect(member).width)),
  );
  const rowHeights = rowMembers.map((cluster) =>
    Math.max(...cluster.map((member) => componentRect(member).height)),
  );
  const occupancy = Array.from({ length: rows }, () => Array.from({ length: columns }, () => 0));
  for (const member of members) {
    const memberRect = componentRect(member);
    const column = columnCenters.findIndex((center) => Math.abs(centerX(memberRect) - center) <= 1);
    const row = rowCenters.findIndex((center) => Math.abs(centerY(memberRect) - center) <= 1);
    if (column < 0 || row < 0 || row * columns + column >= members.length) return false;
    occupancy[row]![column] = occupancy[row]![column]! + 1;
  }

  for (let index = 0; index < members.length; index += 1) {
    const row = Math.floor(index / columns);
    const column = index % columns;
    if (occupancy[row]![column] !== 1) return false;
  }
  let columnStart = roundPixel(group.bounds.x + GROUP_PADDING);
  for (let column = 0; column < columns; column += 1) {
    const expectedCenter = columnStart + columnWidths[column]! / 2;
    if (Math.abs(columnCenters[column]! - expectedCenter) > 0.5) return false;
    columnStart += columnWidths[column]! + INTERNAL_GAP;
  }
  let rowStart = roundPixel(group.bounds.y + GROUP_HEADER + GROUP_PADDING);
  for (let row = 0; row < rows; row += 1) {
    const expectedCenter = rowStart + rowHeights[row]! / 2;
    if (Math.abs(rowCenters[row]! - expectedCenter) > 0.5) return false;
    rowStart += rowHeights[row]! + INTERNAL_GAP;
  }
  return true;
}

/** A physical shelf check lets a second Tidy call no-op even if rounded row centers reorder ties. */
function topLevelAlreadyShelfPacked(units: ArrangeUnit[], anchor: Position): boolean {
  if (units.length < 2 || units.some((unit) => !Number.isInteger(unit.rect.x) || !Number.isInteger(unit.rect.y))) {
    return false;
  }

  const minX = Math.min(...units.map((unit) => unit.rect.x));
  const minY = Math.min(...units.map((unit) => unit.rect.y));
  if (minX !== anchor.x || minY !== anchor.y) return false;

  const widest = Math.max(...units.map((unit) => unit.rect.width));
  const totalArea = units.reduce((sum, unit) => sum + unit.rect.width * unit.rect.height, 0);
  const rowWidthLimit = Math.max(widest, SHELF_ROW_WIDTH_FACTOR * Math.sqrt(totalArea));
  const rowTops = [...new Set(units.map((unit) => unit.rect.y))].sort(compareNumber);
  const rows = rowTops.map((rowTop) => units
    .filter((unit) => unit.rect.y === rowTop)
    .sort((left, right) => compareNumber(left.rect.x, right.rect.x) || compareText(left.id, right.id)));

  if (rows[0]?.[0]?.rect.y !== anchor.y || rows[0]?.[0]?.rect.x !== anchor.x) return false;
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]!;
    let cursorX = anchor.x;
    let rowWidth = 0;
    let rowHeight = 0;
    for (let index = 0; index < row.length; index += 1) {
      const unit = row[index]!;
      if (unit.rect.x !== roundPixel(cursorX)) return false;
      cursorX += unit.rect.width + SHELF_GAP;
      rowWidth += unit.rect.width + (index === 0 ? 0 : SHELF_GAP);
      rowHeight = Math.max(rowHeight, unit.rect.height);
    }
    if (rowWidth > rowWidthLimit + 1) return false;

    const nextRow = rows[rowIndex + 1];
    if (nextRow) {
      if (Math.abs(nextRow[0]!.rect.y - row[0]!.rect.y - rowHeight - SHELF_GAP) > 1) return false;
      if (rowWidth + SHELF_GAP + nextRow[0]!.rect.width <= rowWidthLimit) return false;
    }
  }
  return true;
}

function alreadyTidy(
  components: Component[],
  groupsInScope: Group[],
  units: ArrangeUnit[],
  anchor: Position,
): boolean {
  if (!groupsInScope.every((group) => groupMembersAlreadyPacked(group, components))) return false;
  return topLevelAlreadyShelfPacked(units, anchor);
}

function layoutTidyPass(
  components: Component[],
  groupsInScope: Group[],
  units: ArrangeUnit[],
  anchor: Position,
  positions: Map<string, Position>,
  emptyGroupBounds: Map<string, Rect>,
): void {
  const componentById = componentMap(components);

  // Repack members of scoped groups before calculating their top-level rectangles.
  for (const group of groupsInScope) {
    const members = group.memberComponentIds.flatMap((id) => {
      const component = componentById.get(id);
      const position = positions.get(id);
      return component && position ? [{ component, rect: componentRect({ ...component, position }) }] : [];
    });
    if (members.length === 0) continue;

    members.sort((left, right) => readingOrder(
      { id: left.component.id, kind: "component", rect: left.rect, memberIds: [] },
      { id: right.component.id, kind: "component", rect: right.rect, memberIds: [] },
    ));
    const columns = Math.ceil(Math.sqrt(members.length));
    const rows = Math.ceil(members.length / columns);
    const columnWidths = Array.from({ length: columns }, () => 0);
    const rowHeights = Array.from({ length: rows }, () => 0);
    members.forEach((member, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      columnWidths[column] = Math.max(columnWidths[column]!, member.rect.width);
      rowHeights[row] = Math.max(rowHeights[row]!, member.rect.height);
    });

    const groupRect = rectForGroup(group, componentById, positions, emptyGroupBounds);
    const originX = roundPixel(groupRect.x + GROUP_PADDING);
    const originY = roundPixel(groupRect.y + GROUP_HEADER + GROUP_PADDING);
    const columnStarts: number[] = [];
    const rowStarts: number[] = [];
    let cursor = originX;
    for (const width of columnWidths) {
      columnStarts.push(cursor);
      cursor += width + INTERNAL_GAP;
    }
    cursor = originY;
    for (const height of rowHeights) {
      rowStarts.push(cursor);
      cursor += height + INTERNAL_GAP;
    }

    members.forEach((member, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = roundPixel(columnStarts[column]! + (columnWidths[column]! - member.rect.width) / 2);
      const y = roundPixel(rowStarts[row]! + (rowHeights[row]! - member.rect.height) / 2);
      positions.set(member.component.id, { x, y });
    });
  }

  const topLevel = units.map((unit): ArrangeUnit => {
    if (unit.kind !== "group") {
      const component = componentById.get(unit.id)!;
      const position = positions.get(unit.id)!;
      return { ...unit, rect: componentRect({ ...component, position }) };
    }
    const group = groupsInScope.find((candidate) => candidate.id === unit.id) ??
      // For selected components, this branch is only reached for selected groups.
      undefined;
    if (!group) return unit;
    return { ...unit, rect: rectForGroup(group, componentById, positions, emptyGroupBounds) };
  });

  const ordered = [...topLevel].sort(readingOrder);
  const widest = Math.max(...ordered.map((unit) => unit.rect.width));
  const totalArea = ordered.reduce((sum, unit) => sum + unit.rect.width * unit.rect.height, 0);
  const rowWidthLimit = Math.max(widest, SHELF_ROW_WIDTH_FACTOR * Math.sqrt(totalArea));

  const rows: ArrangeUnit[][] = [];
  let row: ArrangeUnit[] = [];
  let rowWidth = 0;
  for (const unit of ordered) {
    const addedWidth = row.length === 0 ? unit.rect.width : SHELF_GAP + unit.rect.width;
    if (row.length > 0 && rowWidth + addedWidth > rowWidthLimit) {
      rows.push(row);
      row = [];
      rowWidth = 0;
    }
    row.push(unit);
    rowWidth += row.length === 1 ? unit.rect.width : SHELF_GAP + unit.rect.width;
  }
  if (row.length > 0) rows.push(row);

  let rowTop = anchor.y;
  for (const shelfRow of rows) {
    const rowHeight = Math.max(...shelfRow.map((unit) => unit.rect.height));
    let x = anchor.x;
    for (const unit of shelfRow) {
      const targetX = roundPixel(x);
      const targetY = roundPixel(rowTop);
      if (unit.kind === "component") {
        positions.set(unit.id, { x: targetX, y: targetY });
      } else {
        const group = groupsInScope.find((candidate) => candidate.id === unit.id);
        if (group) {
          const before = rectForGroup(group, componentById, positions, emptyGroupBounds);
          const dx = targetX - before.x;
          const dy = targetY - before.y;
          if (group.memberComponentIds.length === 0) {
            const bounds = emptyGroupBounds.get(group.id) ?? group.bounds;
            emptyGroupBounds.set(group.id, {
              ...bounds,
              x: bounds.x + dx,
              y: bounds.y + dy,
            });
          } else {
            translatedPositions(group.memberComponentIds, positions, dx, dy);
          }
        }
      }
      x += unit.rect.width + SHELF_GAP;
    }
    rowTop += rowHeight + SHELF_GAP;
  }
}

/**
 * Pack scoped groups internally and then shelf-pack the resulting top-level units.
 * An empty selection scopes to the whole diagram; relationships never participate.
 */
export function tidy(components: Component[], groups: Group[], selection: Selection): MoveElements | null {
  const scope = getTidyScope(components, groups, selection);
  if (scope.unitCount < 2) return null;

  const diagramScope = scope.kind === "diagram";
  const scopedUnits = diagramScope ? diagramUnits(components, groups) : selectedUnits(components, groups, selection);
  const groupsInScope = diagramScope
    ? groups
    : groups.filter((group) => selection.groupIds.includes(group.id));
  const anchor = {
    x: roundPixel(Math.min(...scopedUnits.map((unit) => unit.rect.x))),
    y: roundPixel(Math.min(...scopedUnits.map((unit) => unit.rect.y))),
  };
  if (alreadyTidy(components, groupsInScope, scopedUnits, anchor)) return null;

  const positions = new Map(components.map((component) => [component.id, { ...component.position }]));
  const emptyGroupBounds = new Map(
    groups.filter((group) => group.memberComponentIds.length === 0).map((group) => [group.id, { ...group.bounds }]),
  );
  layoutTidyPass(components, groupsInScope, scopedUnits, anchor, positions, emptyGroupBounds);

  const componentPositions: Record<string, Position> = {};
  for (const component of components) {
    const position = positions.get(component.id)!;
    if (position.x !== component.position.x || position.y !== component.position.y) {
      componentPositions[component.id] = position;
    }
  }

  const groupDeltas: Record<string, Position> = {};
  for (const group of groups) {
    if (group.memberComponentIds.length !== 0 || !groupsInScope.some((candidate) => candidate.id === group.id)) continue;
    const bounds = emptyGroupBounds.get(group.id)!;
    const dx = bounds.x - group.bounds.x;
    const dy = bounds.y - group.bounds.y;
    if (dx !== 0 || dy !== 0) groupDeltas[group.id] = { x: dx, y: dy };
  }

  return Object.keys(componentPositions).length === 0 && Object.keys(groupDeltas).length === 0
    ? null
    : { componentPositions, groupDeltas };
}
