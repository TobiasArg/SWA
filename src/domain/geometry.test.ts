import { describe, expect, it } from "vitest";
import { GROUP_HEADER, GROUP_PADDING } from "./constants";
import {
  componentRect,
  computeGroupBounds,
  effectiveSize,
  recomputeGroupBounds,
} from "./geometry";
import type { Architecture, Component, Group, Rect } from "./types";

function component(
  id: string,
  type: Component["type"],
  x: number,
  y: number,
  size?: Component["size"],
): Component {
  return {
    id,
    type,
    name: id,
    position: { x, y },
    ...(size ? { size } : {}),
  };
}

function group(id: string, memberComponentIds: string[], bounds: Rect): Group {
  return { id, name: id, memberComponentIds, bounds };
}

function architecture(components: Component[], groups: Group[]): Architecture {
  return {
    id: "arch_test",
    name: "Test architecture",
    createdAt: "2026-10-21T00:00:00Z",
    updatedAt: "2026-10-21T00:00:00Z",
    components,
    relationships: [],
    groups,
  };
}

describe("component geometry", () => {
  it("uses a type's default size until a user-set size is present", () => {
    const defaultAgent = component("cmp_agent", "agent", 10, 20);
    const resizedAgent = component("cmp_resized", "agent", 10, 20, { width: 300, height: 100 });

    expect(effectiveSize(defaultAgent)).toEqual({ width: 220, height: 88 });
    expect(effectiveSize(resizedAgent)).toEqual({ width: 300, height: 100 });
    expect(componentRect(defaultAgent)).toEqual({ x: 10, y: 20, width: 220, height: 88 });
    expect(componentRect(resizedAgent)).toEqual({ x: 10, y: 20, width: 300, height: 100 });
  });
});

describe("group geometry", () => {
  it("computes the tight padded bounds from member rectangles", () => {
    const members = [
      component("cmp_agent", "agent", -10, 20),
      component("cmp_tool", "tool", 300, -20),
    ];

    expect(computeGroupBounds(members)).toEqual({
      x: -10 - GROUP_PADDING,
      y: -20 - GROUP_PADDING - GROUP_HEADER,
      width: 510 + GROUP_PADDING * 2,
      height: 128 + GROUP_PADDING * 2 + GROUP_HEADER,
    });
  });

  it("uses an explicitly resized member's effective rectangle", () => {
    const members = [component("cmp_memory", "memory", 40, 50, { width: 170, height: 60 })];

    expect(computeGroupBounds(members)).toEqual({
      x: 40 - GROUP_PADDING,
      y: 50 - GROUP_PADDING - GROUP_HEADER,
      width: 170 + GROUP_PADDING * 2,
      height: 60 + GROUP_PADDING * 2 + GROUP_HEADER,
    });
  });

  it("rejects an empty member set instead of creating invalid infinite bounds", () => {
    expect(() => computeGroupBounds([])).toThrowError(RangeError);
  });

  it("recomputes only requested non-empty groups and keeps empty group bounds", () => {
    const members = [component("cmp_agent", "agent", 10, 20)];
    const retainedBounds = { x: 1, y: 2, width: 3, height: 4 };
    const untouchedGroup = group("grp_untouched", ["cmp_agent"], retainedBounds);
    const emptyGroup = group("grp_empty", [], { x: 20, y: 30, width: 50, height: 60 });
    const input = architecture(members, [untouchedGroup, emptyGroup]);

    const result = recomputeGroupBounds(input, ["grp_empty", "grp_missing", "grp_empty"]);

    expect(result).toBe(input);
    expect(result.groups[0]).toBe(untouchedGroup);
    expect(result.groups[1]).toBe(emptyGroup);
  });

  it("updates bounds when a member moves outside the previous group box", () => {
    const member = component("cmp_agent", "agent", 400, -100);
    const previousBounds = { x: 0, y: 0, width: 300, height: 200 };
    const input = architecture([member], [group("grp_team", [member.id], previousBounds)]);

    const result = recomputeGroupBounds(input, ["grp_team"]);

    expect(result).not.toBe(input);
    expect(result.groups[0]?.bounds).toEqual({
      x: 400 - GROUP_PADDING,
      y: -100 - GROUP_PADDING - GROUP_HEADER,
      width: 220 + GROUP_PADDING * 2,
      height: 88 + GROUP_PADDING * 2 + GROUP_HEADER,
    });
    expect(input.groups[0]?.bounds).toBe(previousBounds);
  });

  it("returns the original architecture when selected bounds are already current", () => {
    const member = component("cmp_agent", "agent", 10, 20);
    const bounds = computeGroupBounds([member]);
    const input = architecture([member], [group("grp_team", [member.id], bounds)]);

    expect(recomputeGroupBounds(input, ["grp_team"])).toBe(input);
  });
});
