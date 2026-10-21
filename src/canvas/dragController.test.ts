import { describe, expect, it } from "vitest";
import { applyCommand } from "../domain/commands";
import { computeGroupBounds } from "../domain/geometry";
import { dragDelta, finalMoveCommand, startDrag, transientLayout } from "./dragController";
import { buildFixtureArchitecture } from "./testing/fixtures";

const architecture = buildFixtureArchitecture();
const research = architecture.groups.find((g) => g.id === "grp_research")!;
const empty = architecture.groups.find((g) => g.id === "grp_empty")!;

describe("startDrag", () => {
  it("moves the members of a dragged group with it", () => {
    const session = startDrag(architecture, "grp_research", ["grp_research"])!;
    expect([...session.componentStarts.keys()].sort()).toEqual(["cmp_discovery", "cmp_validation"]);
    expect(session.componentStarts.get("cmp_discovery")).toEqual({ x: 420, y: 300 });
    expect(session.groupStarts.get("grp_research")).toEqual(research.bounds);
    expect(session.primaryStart).toEqual({ x: research.bounds.x, y: research.bounds.y });
    expect(session.affectedGroupIds).toEqual(["grp_research"]);
  });

  it("deduplicates a group dragged together with one of its selected members", () => {
    const session = startDrag(architecture, "cmp_discovery", ["cmp_discovery", "grp_research", "cmp_crm"])!;
    expect([...session.componentStarts.keys()].sort()).toEqual(["cmp_crm", "cmp_discovery", "cmp_validation"]);
    expect([...session.groupStarts.keys()]).toEqual(["grp_research"]);
    expect(session.primaryStart).toEqual({ x: 420, y: 300 });
  });

  it("includes the primary node even if React Flow omits it, and ignores unknown ids", () => {
    const session = startDrag(architecture, "cmp_crm", ["nope"])!;
    expect([...session.componentStarts.keys()]).toEqual(["cmp_crm"]);
    expect(session.groupStarts.size).toBe(0);
    expect(session.affectedGroupIds).toEqual([]);
    expect(startDrag(architecture, "nope", [])).toBeNull();
  });

  it("marks the group of a dragged member as affected", () => {
    const session = startDrag(architecture, "cmp_validation", ["cmp_validation"])!;
    expect(session.affectedGroupIds).toEqual(["grp_research"]);
    expect(session.groupStarts.size).toBe(0);
  });
});

describe("transientLayout", () => {
  it("moves every member by the primary delta and translates tight bounds", () => {
    const session = startDrag(architecture, "grp_research", ["grp_research"])!;
    const delta = dragDelta(session, { x: research.bounds.x + 30, y: research.bounds.y - 10 });
    expect(delta).toEqual({ x: 30, y: -10 });
    const layout = transientLayout(architecture, session, delta);
    expect(layout.componentPositions).toEqual({
      cmp_discovery: { x: 450, y: 290 },
      cmp_validation: { x: 750, y: 290 },
    });
    expect(layout.groupBounds.grp_research).toEqual({
      ...research.bounds,
      x: research.bounds.x + 30,
      y: research.bounds.y - 10,
    });
  });

  it("grows the group live when a member is dragged outside", () => {
    const session = startDrag(architecture, "cmp_validation", ["cmp_validation"])!;
    const layout = transientLayout(architecture, session, { x: 400, y: 200 });
    const discovery = architecture.components.find((c) => c.id === "cmp_discovery")!;
    const validation = architecture.components.find((c) => c.id === "cmp_validation")!;
    expect(layout.groupBounds.grp_research).toEqual(
      computeGroupBounds([discovery, { ...validation, position: { x: 1120, y: 500 } }]),
    );
    expect(layout.groupBounds.grp_research!.width).toBeGreaterThan(research.bounds.width);
    expect(layout.componentPositions).toEqual({ cmp_validation: { x: 1120, y: 500 } });
  });

  it("translates an empty dragged group", () => {
    const session = startDrag(architecture, "grp_empty", ["grp_empty"])!;
    const layout = transientLayout(architecture, session, { x: -40, y: 8 });
    expect(layout.componentPositions).toEqual({});
    expect(layout.groupBounds.grp_empty).toEqual({ ...empty.bounds, x: empty.bounds.x - 40, y: empty.bounds.y + 8 });
  });
});

describe("finalMoveCommand", () => {
  it("is null for a zero delta (nothing is dispatched)", () => {
    const session = startDrag(architecture, "grp_research", ["grp_research"])!;
    expect(finalMoveCommand(session, { x: 0, y: 0 })).toBeNull();
    expect(finalMoveCommand(session, { x: Number.NaN, y: 0 })).toBeNull();
  });

  it("builds ONE moveElements with absolute member positions and group deltas", () => {
    const session = startDrag(architecture, "grp_research", ["grp_research", "grp_empty", "cmp_crm"])!;
    const command = finalMoveCommand(session, { x: 10, y: 20 });
    expect(command).toEqual({
      kind: "moveElements",
      componentPositions: {
        cmp_discovery: { x: 430, y: 320 },
        cmp_validation: { x: 730, y: 320 },
        cmp_crm: { x: 1070, y: 100 },
      },
      groupDeltas: { grp_research: { x: 10, y: 20 }, grp_empty: { x: 10, y: 20 } },
    });

    // The real domain operation agrees with the transient layout.
    const next = applyCommand(architecture, command!).architecture;
    const layout = transientLayout(architecture, session, { x: 10, y: 20 });
    for (const group of next.groups) expect(group.bounds).toEqual(layout.groupBounds[group.id]);
    expect(next.groups.map((g) => g.memberComponentIds)).toEqual(architecture.groups.map((g) => g.memberComponentIds));
  });

  it("keeps membership when a member is dragged out; the domain grows the bounds", () => {
    const session = startDrag(architecture, "cmp_validation", ["cmp_validation"])!;
    const command = finalMoveCommand(session, { x: 400, y: 200 })!;
    expect(command).toEqual({
      kind: "moveElements",
      componentPositions: { cmp_validation: { x: 1120, y: 500 } },
      groupDeltas: {},
    });
    const next = applyCommand(architecture, command).architecture;
    const group = next.groups.find((g) => g.id === "grp_research")!;
    expect(group.memberComponentIds).toEqual(["cmp_discovery", "cmp_validation"]);
    expect(group.bounds).toEqual(transientLayout(architecture, session, { x: 400, y: 200 }).groupBounds.grp_research);
  });
});
