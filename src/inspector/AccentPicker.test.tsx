import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ACCENT_IDS, ACCENTS } from "../domain/constants";
import type { Architecture } from "../domain/types";
import { EditorProvider } from "../editor/context";
import { createEditorStore } from "../editor/store";
import { Inspector } from "./Inspector";
import { createTestActions, fixture, renderInspector } from "./testStore";

const EXPECTED_NAMES = [
  "Type default",
  "Tomato",
  "Coral",
  "Tangerine",
  "Mustard",
  "Olive",
  "Fern",
  "Mint",
  "Teal",
  "Lagoon",
  "Sky",
  "Denim",
  "Indigo",
  "Lavender",
  "Plum",
  "Rose",
  "Cocoa",
];

/** Renders the inspector over the real editor store so undo/redo are exercised. */
function renderWithRealStore(architecture: Architecture, componentId: string) {
  const store = createEditorStore(architecture);
  store.setSelection({ componentIds: [componentId], relationshipIds: [], groupIds: [] });
  const dispatch = vi.spyOn(store, "dispatch");
  render(
    <EditorProvider store={store}>
      <Inspector actions={createTestActions()} />
    </EditorProvider>,
  );
  return { store, dispatch };
}

function picker(): HTMLElement {
  return screen.getByRole("group", { name: "Accent color" });
}

function checkedNames(): string[] {
  return within(picker())
    .getAllByRole<HTMLInputElement>("radio")
    .filter((radio) => radio.checked)
    .map((radio) => radio.labels?.[0]?.textContent ?? "");
}

function accentOf(store: ReturnType<typeof createEditorStore>, id: string) {
  return store.getState().architecture.components.find((c) => c.id === id)!.accent;
}

describe("AccentPicker", () => {
  it("is a group named Accent color with 17 radios in palette order, one checked", () => {
    renderInspector(fixture(), { componentIds: ["cmp_tool"] });

    const radios = within(picker()).getAllByRole<HTMLInputElement>("radio");
    expect(radios).toHaveLength(17);
    expect(radios.map((radio) => radio.labels?.[0]?.textContent)).toEqual(EXPECTED_NAMES);
    for (const name of EXPECTED_NAMES) {
      expect(within(picker()).getByRole("radio", { name })).toBeInTheDocument();
    }
    // The names match the §2.3 palette table exactly.
    expect(EXPECTED_NAMES.slice(1)).toEqual(ACCENT_IDS.map((id) => ACCENTS[id].label));
    expect(new Set(radios.map((radio) => radio.name))).toEqual(new Set(["accent-cmp_tool"]));
    expect(checkedNames()).toEqual(["Type default"]);
    expect(screen.getByText("Accent: Type default")).toBeInTheDocument();
    expect(screen.getByTitle("Tomato")).toBeInTheDocument();
  });

  it("sits in an Appearance section after the type fields and before Relationships", () => {
    renderInspector(fixture(), { componentIds: ["cmp_val"] });

    const summaries = Array.from(document.querySelectorAll("summary")).map((s) => s.textContent);
    const appearance = summaries.indexOf("Appearance");
    expect(appearance).toBeGreaterThan(summaries.indexOf("Identity"));
    expect(summaries[appearance + 1]).toBe("Relationships");
    expect(picker().closest("details")?.querySelector("summary")).toHaveTextContent("Appearance");
  });

  it("is shown for every component type", () => {
    for (const id of ["cmp_orch", "cmp_val", "cmp_tool", "cmp_store", "cmp_crm", "cmp_route"]) {
      const view = renderInspector(fixture(), { componentIds: [id] });
      expect(picker()).toBeInTheDocument();
      view.unmount();
    }
  });

  it("checks the stored accent", () => {
    const architecture = fixture();
    architecture.components[3] = { ...architecture.components[3]!, accent: "teal" };
    renderInspector(architecture, { componentIds: ["cmp_tool"] });

    expect(checkedNames()).toEqual(["Teal"]);
    expect(screen.getByText("Accent: Teal")).toBeInTheDocument();
  });

  it("dispatches one command per choice, updates the node accent and the caption", async () => {
    const user = userEvent.setup();
    const { store, dispatch } = renderWithRealStore(fixture(), "cmp_tool");

    await user.click(within(picker()).getByRole("radio", { name: "Plum" }));

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]?.[0]).toEqual({ kind: "setComponentAccent", ids: ["cmp_tool"], accent: "plum" });
    expect(accentOf(store, "cmp_tool")).toBe("plum");
    expect(checkedNames()).toEqual(["Plum"]);
    expect(screen.getByText("Accent: Plum")).toBeInTheDocument();

    await user.click(within(picker()).getByRole("radio", { name: "Type default" }));

    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls[1]?.[0]).toEqual({ kind: "setComponentAccent", ids: ["cmp_tool"], accent: undefined });
    expect(accentOf(store, "cmp_tool")).toBeUndefined();
    expect(screen.getByText("Accent: Type default")).toBeInTheDocument();
  });

  it("follows undo and redo through the store", async () => {
    const user = userEvent.setup();
    const { store } = renderWithRealStore(fixture(), "cmp_tool");

    await user.click(within(picker()).getByRole("radio", { name: "Mint" }));
    await user.click(within(picker()).getByRole("radio", { name: "Rose" }));
    expect(checkedNames()).toEqual(["Rose"]);

    act(() => void store.undo());
    expect(checkedNames()).toEqual(["Mint"]);
    expect(screen.getByText("Accent: Mint")).toBeInTheDocument();

    act(() => void store.undo());
    expect(checkedNames()).toEqual(["Type default"]);

    act(() => void store.redo());
    expect(checkedNames()).toEqual(["Mint"]);
    expect(accentOf(store, "cmp_tool")).toBe("mint");
  });

  it("is a single tab stop moved with arrow keys (one command per step)", async () => {
    const user = userEvent.setup();
    const { store, dispatch } = renderWithRealStore(fixture(), "cmp_tool");

    within(picker()).getByRole("radio", { name: "Type default" }).focus();
    await user.keyboard("{ArrowRight}");

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(accentOf(store, "cmp_tool")).toBe("tomato");
    expect(within(picker()).getByRole("radio", { name: "Tomato" })).toHaveFocus();
  });

  it("is not shown in the group, relationship, architecture or multi-selection inspectors", () => {
    for (const selection of [
      { groupIds: ["grp_a"] },
      { relationshipIds: ["rel_reads"] },
      {},
      { componentIds: ["cmp_tool", "cmp_val"] },
    ]) {
      const view = renderInspector(fixture(), selection);
      expect(screen.queryByRole("group", { name: "Accent color" })).not.toBeInTheDocument();
      expect(screen.queryByText("Appearance", { selector: "summary" })).not.toBeInTheDocument();
      view.unmount();
    }
  });
});
