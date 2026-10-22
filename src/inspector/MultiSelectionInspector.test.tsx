import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AccentId } from "../domain/constants";
import type { Architecture, Selection } from "../domain/types";
import { EditorProvider } from "../editor/context";
import { createEditorStore } from "../editor/store";
import { Inspector } from "./Inspector";
import { createTestActions, fixture, renderInspector } from "./testStore";

function withAccents(accents: Record<string, AccentId>): Architecture {
  const architecture = fixture();
  architecture.components = architecture.components.map((component) =>
    accents[component.id] ? { ...component, accent: accents[component.id] } : component,
  );
  return architecture;
}

/** Renders the inspector over the real editor store so history is exercised. */
function renderWithRealStore(architecture: Architecture, selection: Partial<Selection>) {
  const store = createEditorStore(architecture);
  store.setSelection({ componentIds: [], relationshipIds: [], groupIds: [], ...selection });
  const dispatch = vi.spyOn(store, "dispatch");
  render(
    <EditorProvider store={store}>
      <Inspector actions={createTestActions()} />
    </EditorProvider>,
  );
  return { store, dispatch };
}

function colorGroup(): HTMLElement {
  return screen.getByRole("group", { name: "Color" });
}

function radios(): HTMLInputElement[] {
  return within(colorGroup()).getAllByRole<HTMLInputElement>("radio");
}

function checkedValues(): string[] {
  return radios()
    .filter((radio) => radio.checked)
    .map((radio) => radio.value);
}

function swatchOf(value: string): Element {
  return radios().find((radio) => radio.value === value)!.parentElement!.querySelector(".sa-accent-picker__swatch")!;
}

function usageMarked(): string[] {
  return radios()
    .filter((radio) => radio.parentElement!.querySelector(".sa-accent-picker__usage"))
    .map((radio) => radio.value);
}

describe("MultiSelectionInspector color", () => {
  it("MC1: mixed selection checks nothing, marks usage, and one choice is one undoable command", async () => {
    const user = userEvent.setup();
    const architecture = withAccents({ cmp_tool: "tomato", cmp_val: "mint" });
    const { store, dispatch } = renderWithRealStore(architecture, { componentIds: ["cmp_tool", "cmp_val"] });
    const before = structuredClone(store.getState().architecture.components);

    expect(radios()).toHaveLength(17);
    expect(checkedValues()).toEqual([]);
    expect(screen.getByText("Color: Mixed (2 colors)")).toBeInTheDocument();
    expect(colorGroup()).toHaveAccessibleDescription("Color: Mixed (2 colors)");
    expect(usageMarked()).toEqual(["tomato", "mint"]); // palette order
    expect(within(colorGroup()).getByRole("radio", { name: "Tomato, used by 1 of 2" })).toBeInTheDocument();
    expect(within(colorGroup()).getByRole("radio", { name: "Mint, used by 1 of 2" })).toBeInTheDocument();
    expect(screen.getByText("Applies to 2 selected components.")).toBeInTheDocument();

    await user.click(within(colorGroup()).getByRole("radio", { name: "Fern" }));

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]?.[0]).toEqual({
      kind: "setComponentAccent",
      ids: ["cmp_tool", "cmp_val"],
      accent: "fern",
    });
    expect(checkedValues()).toEqual(["fern"]);
    expect(screen.getByText("Color: Fern")).toBeInTheDocument();
    expect(usageMarked()).toEqual(["fern"]);

    act(() => void store.undo());
    expect(store.getState().architecture.components).toEqual(before);
    expect(store.getState().canUndo).toBe(false);
    expect(checkedValues()).toEqual([]);
    expect(screen.getByText("Color: Mixed (2 colors)")).toBeInTheDocument();
  });

  it("MC1: undo restores an absent accent exactly (Type default counts as a value)", async () => {
    const user = userEvent.setup();
    const architecture = withAccents({ cmp_tool: "tomato" });
    const { store } = renderWithRealStore(architecture, { componentIds: ["cmp_tool", "cmp_val"] });
    const before = structuredClone(store.getState().architecture.components);

    expect(screen.getByText("Color: Mixed (2 colors)")).toBeInTheDocument();
    expect(usageMarked()).toEqual(["", "tomato"]);
    expect(within(colorGroup()).getByRole("radio", { name: "Type default, used by 1 of 2" })).toBeInTheDocument();

    await user.click(within(colorGroup()).getByRole("radio", { name: "Plum" }));
    act(() => void store.undo());

    const components = store.getState().architecture.components;
    expect(components).toEqual(before);
    expect("accent" in components.find((c) => c.id === "cmp_val")!).toBe(false);

    act(() => void store.redo());
    expect(checkedValues()).toEqual(["plum"]);
  });

  it("MC2: a uniform undefined accent checks Type default with the shared type palette", () => {
    renderInspector(fixture(), { componentIds: ["cmp_val", "cmp_disc"] });

    expect(checkedValues()).toEqual([""]);
    expect(screen.getByText("Color: Type default")).toBeInTheDocument();
    expect(swatchOf("")).toHaveAttribute("data-palette", "type-agent");
    expect(swatchOf("")).not.toHaveClass("sa-accent-picker__swatch--neutral");
  });

  it("MC2: a uniform accent checks that radio", () => {
    renderInspector(withAccents({ cmp_tool: "teal", cmp_val: "teal" }), { componentIds: ["cmp_tool", "cmp_val"] });

    expect(checkedValues()).toEqual(["teal"]);
    expect(screen.getByText("Color: Teal")).toBeInTheDocument();
    expect(within(colorGroup()).getByRole("radio", { name: "Teal, used by 2 of 2" })).toBeChecked();
  });

  it("MC2: mixed types use the neutral Type default swatch", () => {
    renderInspector(fixture(), { componentIds: ["cmp_tool", "cmp_val"] });

    expect(swatchOf("")).not.toHaveAttribute("data-palette");
    expect(swatchOf("")).toHaveClass("sa-accent-picker__swatch--neutral");
    expect(within(colorGroup()).getByRole("radio", { name: /^Type default/ })).toBeChecked();
  });

  it("MC2: with a relationship selected, color applies to the one component only", async () => {
    const user = userEvent.setup();
    const { store, dispatch } = renderWithRealStore(fixture(), {
      componentIds: ["cmp_tool"],
      relationshipIds: ["rel_reads"],
      groupIds: ["grp_b"],
    });

    expect(
      screen.getByText("Applies to 1 selected component. Groups and relationships have no color."),
    ).toBeInTheDocument();
    expect(swatchOf("")).toHaveAttribute("data-palette", "type-tool");

    await user.click(within(colorGroup()).getByRole("radio", { name: "Sky" }));

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]?.[0]).toEqual({ kind: "setComponentAccent", ids: ["cmp_tool"], accent: "sky" });
    const { groups, relationships } = store.getState().architecture;
    expect(groups.every((group) => !("accent" in group))).toBe(true);
    expect(relationships.every((relationship) => !("accent" in relationship))).toBe(true);
  });

  it("MC2: only relationships and groups selected shows no Color section", () => {
    renderInspector(fixture(), { relationshipIds: ["rel_reads", "rel_gen"], groupIds: ["grp_a"] });

    expect(screen.queryByRole("group", { name: "Color" })).not.toBeInTheDocument();
    expect(screen.queryByText("Color", { selector: "summary" })).not.toBeInTheDocument();
  });

  it("is a Color section after Selection, open by default", () => {
    renderInspector(fixture(), { componentIds: ["cmp_tool", "cmp_val"] });

    const summaries = Array.from(document.querySelectorAll("summary")).map((s) => s.textContent);
    expect(summaries).toEqual(["Selection", "Color"]);
    expect(colorGroup().closest("details")).toHaveAttribute("open");
  });

  it("keyboard: with none checked, arrows move and choose, one command per step", async () => {
    const user = userEvent.setup();
    const { store, dispatch } = renderWithRealStore(withAccents({ cmp_tool: "tomato", cmp_val: "mint" }), {
      componentIds: ["cmp_tool", "cmp_val"],
    });

    within(colorGroup()).getByRole("radio", { name: "Type default" }).focus();
    await user.keyboard("{ArrowRight}");

    expect(dispatch).toHaveBeenCalledTimes(1);
    const accents = store.getState().architecture.components
      .filter((c) => c.id === "cmp_tool" || c.id === "cmp_val")
      .map((c) => c.accent);
    expect(accents).toEqual(["tomato", "tomato"]);
    expect(checkedValues()).toEqual(["tomato"]);
  });
});
