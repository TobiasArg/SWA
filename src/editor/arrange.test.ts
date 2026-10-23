import { describe, expect, it, vi } from "vitest";
import { DomainError } from "../domain/commands";
import { createEditorStore } from "./store";
import {
  alignSelection,
  distributeSelection,
  tidyLayout,
  type ArrangeActionResult,
} from "./arrange";
import type { Architecture, Component, Selection } from "../domain/types";
import type { EditorStore } from "./storeTypes";

function fixture(): Architecture {
  const components: Component[] = [
    { id: "cmp_a", type: "agent", name: "A", position: { x: 80, y: 20 } },
    {
      id: "cmp_b",
      type: "tool",
      name: "B",
      position: { x: 400, y: 150 },
      size: { width: 200, height: 72 },
    },
    { id: "cmp_c", type: "memory", name: "C", position: { x: 900, y: 230 } },
    { id: "cmp_d", type: "agent", name: "D", position: { x: 1400, y: 10 } },
  ];
  return {
    id: "arch_arrange_test",
    name: "Arrange test",
    createdAt: "2026-10-22T00:00:00Z",
    updatedAt: "2026-10-22T00:00:00Z",
    components,
    relationships: [
      {
        id: "rel_ab",
        type: "uses",
        sourceId: "cmp_a",
        targetId: "cmp_b",
        direction: "directed",
        label: "keeps its label",
        visual: { ports: { source: "right", target: "left" }, retained: [1, 2, 3] },
      },
    ],
    groups: [
      {
        id: "grp_team",
        name: "Team",
        memberComponentIds: ["cmp_b"],
        bounds: { x: 376, y: 94, width: 248, height: 152 },
      },
      {
        id: "grp_empty",
        name: "Empty group",
        memberComponentIds: [],
        bounds: { x: 1800, y: 300, width: 100, height: 80 },
      },
    ],
  };
}

function selection(componentIds: string[] = [], relationshipIds: string[] = [], groupIds: string[] = []): Selection {
  return { componentIds, relationshipIds, groupIds };
}

function selectedComponents(): Selection {
  return selection(["cmp_a", "cmp_b", "cmp_c", "cmp_d"]);
}

function withoutGeometry(architecture: Architecture): Architecture {
  const stripped = structuredClone(architecture);
  stripped.updatedAt = "ignored store timestamp";
  for (const component of stripped.components) component.position = { x: 0, y: 0 };
  for (const group of stripped.groups) group.bounds = { x: 0, y: 0, width: 0, height: 0 };
  return stripped;
}

function positions(architecture: Architecture): Component["position"][] {
  return architecture.components.map((component) => ({ ...component.position }));
}

function groupBounds(architecture: Architecture): Architecture["groups"][number]["bounds"][] {
  return architecture.groups.map((group) => ({ ...group.bounds }));
}

interface ArrangeCase {
  title: string;
  label: string;
  selection: Selection;
  unitCount: number;
  message: string;
  run(store: EditorStore): ArrangeActionResult;
}

const arrangeCases: ArrangeCase[] = [
  {
    title: "aligns",
    label: "Align left",
    selection: selectedComponents(),
    unitCount: 4,
    message: "Aligned 4 items left.",
    run: (store) => alignSelection(store, "left"),
  },
  {
    title: "aligns centers",
    label: "Align centers",
    selection: selectedComponents(),
    unitCount: 4,
    message: "Aligned 4 items by their centers.",
    run: (store) => alignSelection(store, "centers"),
  },
  {
    title: "aligns right",
    label: "Align right",
    selection: selectedComponents(),
    unitCount: 4,
    message: "Aligned 4 items right.",
    run: (store) => alignSelection(store, "right"),
  },
  {
    title: "aligns top",
    label: "Align top",
    selection: selectedComponents(),
    unitCount: 4,
    message: "Aligned 4 items to the top.",
    run: (store) => alignSelection(store, "top"),
  },
  {
    title: "aligns middles",
    label: "Align middles",
    selection: selectedComponents(),
    unitCount: 4,
    message: "Aligned 4 items by their middles.",
    run: (store) => alignSelection(store, "middles"),
  },
  {
    title: "aligns bottom",
    label: "Align bottom",
    selection: selectedComponents(),
    unitCount: 4,
    message: "Aligned 4 items to the bottom.",
    run: (store) => alignSelection(store, "bottom"),
  },
  {
    title: "distributes",
    label: "Distribute horizontally",
    selection: selectedComponents(),
    unitCount: 4,
    message: "Distributed 4 items.",
    run: (store) => distributeSelection(store, "horizontal"),
  },
  {
    title: "distributes vertically",
    label: "Distribute vertically",
    selection: selectedComponents(),
    unitCount: 4,
    message: "Distributed 4 items.",
    run: (store) => distributeSelection(store, "vertical"),
  },
  {
    title: "tidies the unselected diagram",
    label: "Tidy layout",
    selection: selection(),
    unitCount: 5,
    message: "Tidied 5 items.",
    run: (store) => tidyLayout(store),
  },
];

describe("arrange editor actions", () => {
  it.each(arrangeCases)("$title in one labeled move command and one undo", ({
    label,
    selection: selected,
    unitCount,
    message,
    run,
  }) => {
    const store = createEditorStore(fixture(), () => "arranged");
    store.setSelection(selected);
    const dispatch = store.dispatch.bind(store);
    const dispatchSpy = vi.spyOn(store, "dispatch").mockImplementation((command, options) => dispatch(command, options));
    const before = structuredClone(store.getState().architecture);
    const beforePositions = positions(before);
    const beforeBounds = groupBounds(before);

    const result = run(store);
    expect(result).toMatchObject({ ok: true, changed: true, unitCount, message });
    if (label === "Tidy layout") expect(result).toMatchObject({ scope: "diagram" });
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "moveElements" }),
      { label },
    );

    const after = store.getState().architecture;
    expect(positions(after)).not.toEqual(beforePositions);
    expect(groupBounds(after)).not.toEqual(beforeBounds);
    expect(withoutGeometry(after)).toEqual(withoutGeometry(before));
    expect(JSON.stringify(after.relationships)).toBe(JSON.stringify(before.relationships));
    expect(after.groups.map((group) => group.memberComponentIds)).toEqual(
      before.groups.map((group) => group.memberComponentIds),
    );

    store.undo();
    expect(positions(store.getState().architecture)).toEqual(beforePositions);
    expect(groupBounds(store.getState().architecture)).toEqual(beforeBounds);
    expect(store.getState().canUndo).toBe(false);
    expect(store.getState().canRedo).toBe(true);
  });

  it("returns Already arranged without dispatch or history when a plan is a no-op", () => {
    const store = createEditorStore(fixture(), () => "should-not-run");
    store.setSelection(selection(["cmp_a"]));
    const dispatchSpy = vi.spyOn(store, "dispatch");

    for (const result of [
      alignSelection(store, "left"),
      distributeSelection(store, "horizontal"),
      tidyLayout(store),
    ]) {
      expect(result).toMatchObject({ ok: true, changed: false, unitCount: 1, message: "Already arranged." });
    }
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(store.getState().canUndo).toBe(false);

    store.setSelection(selection([], ["rel_ab"]));
    const relationshipOnlyTidy = tidyLayout(store);
    expect(relationshipOnlyTidy).toMatchObject({
      ok: true,
      changed: false,
      unitCount: 0,
      scope: "selection",
      message: "Already arranged.",
    });
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(store.getState().canUndo).toBe(false);
  });

  it("preserves a dispatch error and does not create history", () => {
    const store = createEditorStore(fixture(), () => "should-not-run");
    store.setSelection(selectedComponents());
    const before = store.getState().architecture;
    const error = new DomainError("E_TEST_MOVE", "The move was rejected.");
    const dispatchSpy = vi.spyOn(store, "dispatch").mockReturnValue({ ok: false, error });

    const result = alignSelection(store, "left");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(error);
    expect(result).toMatchObject({ message: error.message, changed: false, unitCount: 4 });
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledWith(expect.anything(), { label: "Align left" });
    expect(store.getState().architecture).toBe(before);
    expect(store.getState().canUndo).toBe(false);
  });
});
