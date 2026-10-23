import { describe, expect, it } from "vitest";
import leadHuntingRaw from "./validation/__fixtures__/lead-hunting-engine.json?raw";
import { applyCommand } from "./operations";
import { componentRect, computeGroupBounds } from "./geometry";
import { normalizeArchitecture } from "./normalize";
import {
  ALIGN_MODES,
  align,
  countArrangeUnits,
  distribute,
  getTidyScope,
  tidy,
  type ArrangeAxis,
  type MoveElements,
} from "./arrange";
import type { Architecture, Component, Group, Position, Selection } from "./types";

function component(
  id: string,
  x: number,
  y: number,
  width = 20,
  height = 20,
): Component {
  return {
    id,
    type: "agent",
    name: id,
    position: { x, y },
    size: { width, height },
  };
}

function group(id: string, members: Component[], bounds?: Group["bounds"]): Group {
  return {
    id,
    name: id,
    memberComponentIds: members.map((member) => member.id),
    bounds: bounds ?? (members.length > 0 ? computeGroupBounds(members) : { x: 0, y: 0, width: 20, height: 20 }),
  };
}

function selection(componentIds: string[] = [], groupIds: string[] = [], relationshipIds: string[] = []): Selection {
  return { componentIds, groupIds, relationshipIds };
}

function architecture(
  components: Component[],
  groups: Group[] = [],
  relationships: Architecture["relationships"] = [],
): Architecture {
  return {
    id: "arch_arrange_test",
    name: "Arrange Test",
    createdAt: "2026-10-22T00:00:00Z",
    updatedAt: "2026-10-22T00:00:00Z",
    components,
    groups,
    relationships,
  };
}

function applyMove(input: Architecture, move: MoveElements | null): Architecture {
  if (!move) return input;
  return applyCommand(input, { kind: "moveElements", ...move }).architecture;
}

function assertSemanticInvariance(before: Architecture, after: Architecture): void {
  const stripGeometry = (value: Architecture): unknown => ({
    ...value,
    components: value.components.map(({ position: _position, ...componentValue }) => componentValue),
    groups: value.groups.map(({ bounds: _bounds, ...groupValue }) => groupValue),
  });
  expect(stripGeometry(after)).toEqual(stripGeometry(before));
  expect(JSON.stringify(after.relationships)).toBe(JSON.stringify(before.relationships));
  expect(after.components.map((item) => item.id)).toEqual(before.components.map((item) => item.id));
  expect(after.groups.map((item) => item.id)).toEqual(before.groups.map((item) => item.id));
  expect(after.groups.map((item) => item.memberComponentIds)).toEqual(before.groups.map((item) => item.memberComponentIds));
}

function xPosition(move: MoveElements | null, id: string): number | undefined {
  return move?.componentPositions[id]?.x;
}

function yPosition(move: MoveElements | null, id: string): number | undefined {
  return move?.componentPositions[id]?.y;
}

function intersects(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function assertTidyGeometry(value: Architecture): void {
  const byId = new Map(value.components.map((item) => [item.id, item]));
  for (const group of value.groups) {
    const members = group.memberComponentIds.flatMap((id) => {
      const member = byId.get(id);
      return member ? [member] : [];
    });
    if (members.length === 0) continue;
    expect(group.bounds).toEqual(computeGroupBounds(members));
    for (const member of members) {
      const rect = componentRect(member);
      expect(rect.x).toBeGreaterThanOrEqual(group.bounds.x);
      expect(rect.y).toBeGreaterThanOrEqual(group.bounds.y);
      expect(rect.x + rect.width).toBeLessThanOrEqual(group.bounds.x + group.bounds.width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(group.bounds.y + group.bounds.height);
    }
  }

  const groupMemberIds = new Set(value.groups.flatMap((group) => group.memberComponentIds));
  const topLevel = [
    ...value.groups.map((group) => group.bounds),
    ...value.components.filter((item) => !groupMemberIds.has(item.id)).map(componentRect),
  ];
  for (let firstIndex = 0; firstIndex < topLevel.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < topLevel.length; secondIndex += 1) {
      expect(intersects(topLevel[firstIndex]!, topLevel[secondIndex]!)).toBe(false);
    }
  }
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function seededFixture(seed: number): Architecture {
  const random = seededRandom(seed);
  const components = Array.from({ length: 7 }, (_, index) => {
    const width = 31 + Math.floor(random() * 31);
    const height = 23 + Math.floor(random() * 29);
    return component(
      `cmp_${index}`,
      Math.floor(random() * 500) - 250 + (random() < 0.5 ? 0.25 : 0.75),
      Math.floor(random() * 500) - 250 + (random() < 0.5 ? 0.25 : 0.75),
      width,
      height,
    );
  });
  const members = components.slice(1, 4);
  const grouped = group("grp_seeded", members);
  const empty = group("grp_empty", [], { x: -70.5, y: 60.25, width: 41, height: 33 });
  return architecture(components, [grouped, empty], [
    {
      id: "rel_0",
      type: "generic",
      sourceId: "cmp_0",
      targetId: "cmp_1",
      direction: "directed",
      label: "unchanged",
      visual: { ports: { source: "left", target: "right" }, retained: [1, 2, 3] },
    },
  ]);
}

describe("arrange geometry", () => {
  it("aligns every mode to the selection union and rounds only final pixel positions", () => {
    const components = [
      component("a", 0.25, 0.25, 10, 8),
      component("b", 60.5, 12.25, 20, 12),
      component("c", 120.75, 100.5, 30, 16),
    ];
    const selected = selection(components.map((item) => item.id));
    const expected: Record<(typeof ALIGN_MODES)[number], Record<string, Position>> = {
      left: { a: { x: 0, y: 0.25 }, b: { x: 0, y: 12.25 }, c: { x: 0, y: 100.5 } },
      centers: { a: { x: 71, y: 0.25 }, b: { x: 66, y: 12.25 }, c: { x: 61, y: 100.5 } },
      right: { a: { x: 141, y: 0.25 }, b: { x: 131, y: 12.25 }, c: { x: 121, y: 100.5 } },
      top: { a: { x: 0.25, y: 0 }, b: { x: 60.5, y: 0 }, c: { x: 120.75, y: 0 } },
      middles: { a: { x: 0.25, y: 54 }, b: { x: 60.5, y: 52 }, c: { x: 120.75, y: 50 } },
      bottom: { a: { x: 0.25, y: 109 }, b: { x: 60.5, y: 105 }, c: { x: 120.75, y: 101 } },
    };

    for (const mode of ALIGN_MODES) {
      const move = align(components, [], selected, mode)!;
      for (const [id, position] of Object.entries(expected[mode])) {
        expect(move.componentPositions[id]).toEqual(position);
      }
    }
  });

  it("distributes edges at equal gaps and falls back to equal centers for overlap", () => {
    const components = [component("a", 0, 0, 10, 10), component("b", 40, 15, 20, 10), component("c", 100, 30, 10, 10)];
    const horizontal = distribute(components, [], selection(components.map((item) => item.id)), "horizontal");
    expect(xPosition(horizontal, "b")).toBe(45);
    expect(horizontal?.componentPositions.a).toBeUndefined();
    expect(horizontal?.componentPositions.c).toBeUndefined();

    const verticalComponents = [component("a", 0, 0, 10, 10), component("b", 30, 40, 10, 20), component("c", 60, 100, 10, 10)];
    const vertical = distribute(verticalComponents, [], selection(verticalComponents.map((item) => item.id)), "vertical");
    expect(yPosition(vertical, "b")).toBe(45);

    const overlapping = [component("a", 0, 0, 30, 10), component("b", 15, 0, 30, 10), component("c", 40, 0, 30, 10)];
    const fallback = distribute(overlapping, [], selection(overlapping.map((item) => item.id)), "horizontal");
    expect(xPosition(fallback, "b")).toBe(20);
  });

  it("sorts distribution once, keeps tied endpoints fixed, and accumulates ideal fractional gaps", () => {
    const large = [
      component("first", 0.1, 0, 161, 10),
      component("wide_b", 300, 0, 601, 10),
      component("wide_c", 900, 0, 257, 10),
      component("wide_d", 1400, 0, 799, 10),
      component("last", 1818.9, 0, 109, 10),
    ];
    const largeSelection = selection(large.map((item) => item.id));
    const largeMove = distribute(large, [], largeSelection, "horizontal");
    expect(largeMove?.componentPositions).toMatchObject({
      wide_b: { x: 161 },
      wide_c: { x: 763 },
      wide_d: { x: 1020 },
    });
    expect(largeMove?.componentPositions).not.toHaveProperty("first");
    expect(largeMove?.componentPositions).not.toHaveProperty("last");
    const largeResult = applyMove(architecture(large), largeMove);
    expect(distribute(largeResult.components, largeResult.groups, largeSelection, "horizontal")).toBeNull();

    const tied = [
      component("c", -275, 0, 700, 10),
      component("d", 75, 0, 50, 10),
      component("b", -50, 0, 200, 10),
      component("a", 0, 0, 100, 10),
    ];
    const tiedSelection = selection(tied.map((item) => item.id));
    const tiedMove = distribute(tied, [], tiedSelection, "horizontal");
    expect(tiedMove?.componentPositions).toMatchObject({ b: { x: -33 }, c: { x: -267 } });
    expect(tiedMove?.componentPositions).not.toHaveProperty("a");
    expect(tiedMove?.componentPositions).not.toHaveProperty("d");
    const tiedResult = applyMove(architecture(tied), tiedMove);
    expect(distribute(tiedResult.components, tiedResult.groups, tiedSelection, "horizontal")).toBeNull();
  });

  it("keeps selected groups rigid, moves empty groups with deltas, and lets unselected-group members move alone", () => {
    const memberA = component("member_a", 100, 40, 20, 20);
    const memberB = component("member_b", 150, 55, 30, 25);
    const grouped = group("grp_rigid", [memberA, memberB]);
    const peer = component("peer", 0, 0, 40, 30);
    const rigidArchitecture = architecture([memberA, memberB, peer], [grouped]);
    const rigidMove = align(
      rigidArchitecture.components,
      rigidArchitecture.groups,
      selection([memberA.id, memberB.id, peer.id], [grouped.id]),
      "centers",
    );
    expect(rigidMove).not.toBeNull();
    const memberAAfter = rigidMove!.componentPositions.member_a!;
    const memberBAfter = rigidMove!.componentPositions.member_b!;
    expect(memberAAfter.x - memberA.position.x).toBe(memberBAfter.x - memberB.position.x);
    expect(rigidMove?.componentPositions.peer).toBeDefined();
    expect(rigidMove?.groupDeltas).toEqual({});
    const rigidResult = applyMove(rigidArchitecture, rigidMove);
    expect(rigidResult.groups[0]?.memberComponentIds).toEqual(["member_a", "member_b"]);
    expect(rigidResult.groups[0]?.bounds).toEqual(
      computeGroupBounds(rigidResult.components.filter((item) => grouped.memberComponentIds.includes(item.id))),
    );

    const first = component("first", 0, 0, 10, 10);
    const last = component("last", 100, 0, 10, 10);
    const empty = group("grp_empty", [], { x: 40, y: 0, width: 20, height: 20 });
    const emptyMove = distribute([first, last], [empty], selection([first.id, last.id], [empty.id]), "horizontal");
    expect(emptyMove?.groupDeltas.grp_empty).toEqual({ x: 5, y: 0 });
    expect(emptyMove?.componentPositions).toEqual({});

    const rigidA = component("rigid_a", 40, 0, 20, 20);
    const rigidB = component("rigid_b", 50, 5, 20, 20);
    const rigidGroup = group("grp_distribute", [rigidA, rigidB]);
    const distributeFirst = component("distribute_first", 0, 0, 10, 10);
    const distributeLast = component("distribute_last", 120, 0, 10, 10);
    const rigidDistribution = distribute(
      [distributeFirst, rigidA, rigidB, distributeLast],
      [rigidGroup],
      selection([distributeFirst.id, rigidA.id, rigidB.id, distributeLast.id], [rigidGroup.id]),
      "horizontal",
    );
    expect(rigidDistribution?.componentPositions.rigid_a?.x).toBe(50);
    expect(rigidDistribution?.componentPositions.rigid_b?.x).toBe(60);
    expect(rigidDistribution?.groupDeltas).toEqual({});

    const unselectedGroup = group("grp_unselected", [memberA, memberB]);
    const standalone = component("standalone", 300, 0, 20, 20);
    const memberMove = align(
      [memberA, memberB, standalone],
      [unselectedGroup],
      selection([memberA.id, standalone.id]),
      "right",
    );
    expect(memberMove?.componentPositions).toHaveProperty("member_a");
    expect(memberMove?.componentPositions).not.toHaveProperty("member_b");
    expect(memberMove?.groupDeltas).toEqual({});
  });

  it("counts selection units without relationship-driven whole-diagram fallback", () => {
    const a = component("a", 0, 0);
    const b = component("b", 100, 0);
    const c = component("c", 200, 0);
    const grouped = group("g", [a, b]);
    const components = [a, b, c];
    expect(countArrangeUnits(components, [grouped], selection([a.id, b.id, c.id], [grouped.id]))).toBe(2);
    expect(getTidyScope(components, [grouped], selection([], [], ["rel_only"]))).toEqual({
      kind: "selection",
      unitCount: 0,
    });
    expect(tidy(components, [grouped], selection([], [], ["rel_only"]))).toBeNull();
    expect(getTidyScope(components, [grouped], selection())).toEqual({ kind: "diagram", unitCount: 2 });
    expect(tidy(components, [grouped], selection())).not.toBeNull();

    const emptyGroup = group("grp_empty", [], { x: 500, y: 400, width: 50, height: 40 });
    const wholeDiagramMove = tidy([a, b], [emptyGroup], selection());
    expect(wholeDiagramMove?.groupDeltas.grp_empty).toBeDefined();
  });

  it("packs group members in a grid then shelf-packs top-level units without overlap", () => {
    const a = component("a", 0, 0, 20, 10);
    const b = component("b", 100, 0, 40, 30);
    const c = component("c", 0, 100, 10, 20);
    const grouped = group("grp", [a, b, c]);
    const outsideA = component("outside_a", 400, 100, 30, 30);
    const outsideB = component("outside_b", 700, 200, 40, 20);
    const input = architecture([a, b, c, outsideA, outsideB], [grouped]);
    const selected = selection([a.id, b.id, c.id, outsideA.id, outsideB.id], [grouped.id]);
    const move = tidy(input.components, input.groups, selected);
    expect(move).not.toBeNull();

    const result = applyMove(input, move);
    const resultGroup = result.groups[0]!;
    const members = result.components.filter((item) => grouped.memberComponentIds.includes(item.id));
    const resultA = result.components.find((item) => item.id === a.id)!;
    const resultB = result.components.find((item) => item.id === b.id)!;
    const resultC = result.components.find((item) => item.id === c.id)!;
    expect(resultB.position.x - resultA.position.x).toBe(60); // 20 px cell + 40 px gap.
    expect(resultC.position.y - resultA.position.y).toBe(60); // 30 px row + 40 px gap, centered in its cell.
    expect(resultGroup.bounds).toEqual(computeGroupBounds(members));
    expect(members.every((member) => {
      const rect = componentRect(member);
      return rect.x >= resultGroup.bounds.x && rect.y >= resultGroup.bounds.y &&
        rect.x + rect.width <= resultGroup.bounds.x + resultGroup.bounds.width &&
        rect.y + rect.height <= resultGroup.bounds.y + resultGroup.bounds.height;
    })).toBe(true);

    const topLevel = [resultGroup.bounds, ...result.components
      .filter((item) => item.id === outsideA.id || item.id === outsideB.id)
      .map(componentRect)];
    for (let firstIndex = 0; firstIndex < topLevel.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < topLevel.length; secondIndex += 1) {
        expect(intersects(topLevel[firstIndex]!, topLevel[secondIndex]!)).toBe(false);
      }
    }
    expect(tidy(result.components, result.groups, selected)).toBeNull();
    expect(tidy(input.components, input.groups, selected)).toEqual(move);
  });

  it("anchors shelf packing to the original scope top-left before internal group packing", () => {
    const memberA = component("member_a", 200, 280, 220, 88);
    const memberB = component("member_b", 440, 280, 220, 88);
    const staleGroup = group("grp_anchor", [memberA, memberB], { x: 160, y: 240, width: 480, height: 140 });
    const outside = component("outside", 900, 600, 30, 30);
    const input = architecture([memberA, memberB, outside], [staleGroup]);

    const move = tidy(input.components, input.groups, selection());
    expect(move).not.toBeNull();
    const result = applyMove(input, move);
    expect(result.groups[0]?.bounds.x).toBe(160);
    expect(result.groups[0]?.bounds.y).toBe(240);
    expect(Math.min(...result.groups.map((item) => item.bounds.x), ...result.components
      .filter((item) => !staleGroup.memberComponentIds.includes(item.id))
      .map((item) => componentRect(item).x))).toBe(160);
    expect(Math.min(...result.groups.map((item) => item.bounds.y), ...result.components
      .filter((item) => !staleGroup.memberComponentIds.includes(item.id))
      .map((item) => componentRect(item).y))).toBe(240);
  });

  it("is a no-op below operation minimums and after rounded center alignment", () => {
    const single = component("single", 1.25, -1.5, 11, 9);
    expect(align([single], [], selection([single.id]), "centers")).toBeNull();
    expect(distribute([single], [], selection([single.id]), "horizontal")).toBeNull();
    expect(tidy([single], [], selection([single.id]))).toBeNull();

    const oddEven = [component("odd", 0, 0, 11, 11), component("even", 19, 9, 10, 10)];
    const selected = selection(oddEven.map((item) => item.id));
    const move = align(oddEven, [], selected, "centers");
    expect(move).not.toBeNull();
    const moved = oddEven.map((item) => ({
      ...item,
      position: move!.componentPositions[item.id] ?? item.position,
    }));
    expect(align(moved, [], selected, "centers")).toBeNull();
  });
});

describe("arrange invariants", () => {
  it("is relationship-blind for every operation", () => {
    const input = seededFixture(901);
    const reversedRelationships: Architecture["relationships"] = input.relationships.map((relationship) => ({
      ...relationship,
      sourceId: relationship.targetId,
      targetId: relationship.sourceId,
    }));
    const retypedRelationships: Architecture["relationships"] = input.relationships.map((relationship) => ({
      ...relationship,
      type: "uses",
      direction: "directed",
      visual: { ports: { source: "bottom", target: "top" }, changed: true },
    }));
    const selected = selection(input.components.map((item) => item.id), input.groups.map((item) => item.id));
    const runGeometry = (value: Architecture) => [
      ...ALIGN_MODES.map((mode) => align(value.components, value.groups, selected, mode)),
      distribute(value.components, value.groups, selected, "horizontal"),
      distribute(value.components, value.groups, selected, "vertical"),
      tidy(value.components, value.groups, selected),
    ];
    const operationMoves = runGeometry(input);
    expect(runGeometry({ ...input, relationships: [] })).toEqual(operationMoves);
    expect(runGeometry({ ...input, relationships: reversedRelationships })).toEqual(operationMoves);
    expect(runGeometry({ ...input, relationships: retypedRelationships })).toEqual(operationMoves);
    expect(reversedRelationships).not.toEqual(input.relationships);
    expect(retypedRelationships).not.toEqual(input.relationships);
    expect(input.relationships.map((relationship) => relationship.type)).not.toEqual(
      retypedRelationships.map((relationship) => relationship.type),
    );
  });

  it("preserves semantic data for seeded fixtures, including Lead Hunting Engine", () => {
    const leadHunting = (JSON.parse(leadHuntingRaw) as { architecture: Architecture }).architecture;
    const generated = Array.from({ length: 30 }, (_, index) => seededFixture(0x51a7 + index));
    const fixtures = [leadHunting, ...generated];

    for (const input of fixtures) {
      const selected = selection(
        input.components.map((item) => item.id),
        input.groups.map((item) => item.id),
      );
      const moves: Array<MoveElements | null> = [
        ...ALIGN_MODES.map((mode) => align(input.components, input.groups, selected, mode)),
        ...(["horizontal", "vertical"] as ArrangeAxis[]).map((axis) =>
          distribute(input.components, input.groups, selected, axis),
        ),
        tidy(input.components, input.groups, selected),
        tidy(input.components, input.groups, selection()),
      ];
      for (const move of moves) {
        const result = applyMove(input, move);
        assertSemanticInvariance(input, result);
      }

      const wholeDiagramTidy = tidy(input.components, input.groups, selection());
      const tidied = applyMove(input, wholeDiagramTidy);
      expect(wholeDiagramTidy).toEqual(tidy(input.components, input.groups, selection()));
      assertTidyGeometry(tidied);
      expect(tidy(tidied.components, tidied.groups, selection())).toBeNull();

    }

    // The imported lead-hunting record is schema v1 and its group bounds are
    // intentionally recomputed by the normalizer before the editor sees it.
    const idempotentFixtures = [normalizeArchitecture(leadHunting), ...generated];
    for (const input of idempotentFixtures) {
      const selected = selection(
        input.components.map((item) => item.id),
        input.groups.map((item) => item.id),
      );
      for (const mode of ALIGN_MODES) {
        const result = applyMove(input, align(input.components, input.groups, selected, mode));
        expect(align(result.components, result.groups, selected, mode), `align ${mode}`).toBeNull();
      }
      for (const axis of ["horizontal", "vertical"] as const) {
        const result = applyMove(input, distribute(input.components, input.groups, selected, axis));
        expect(distribute(result.components, result.groups, selected, axis)).toBeNull();
      }
      const selectedTidy = applyMove(input, tidy(input.components, input.groups, selected));
      expect(tidy(selectedTidy.components, selectedTidy.groups, selected)).toBeNull();
      const diagramTidy = applyMove(input, tidy(input.components, input.groups, selection()));
      expect(tidy(diagramTidy.components, diagramTidy.groups, selection())).toBeNull();
    }
  });
});
