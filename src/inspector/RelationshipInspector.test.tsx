import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Architecture } from "../domain/types";
import { EditorProvider } from "../editor/context";
import { createEditorStore } from "../editor/store";
import { Inspector } from "./Inspector";
import { EMPTY_RELATIONSHIPS_TEXT } from "./RelationshipList";
import { createTestActions, fixture, renderInspector } from "./testStore";

function relationship(store: ReturnType<typeof renderInspector>["store"], id: string) {
  return store.getState().architecture.relationships.find((rel) => rel.id === id)!;
}

function relationshipsSection(): HTMLElement {
  return screen.getByText("Relationships", { selector: "summary" }).closest("details")!;
}

describe("RelationshipList (read-only)", () => {
  it("groups entries by type with direction glyphs and labels", () => {
    renderInspector(fixture(), { componentIds: ["cmp_val"] });
    const list = relationshipsSection();

    const reads = within(list).getByRole("region", { name: "Reads From" });
    expect(within(reads).getByRole("button", { name: /Open relationship: Validation Agent reads from/ }))
      .toHaveTextContent("→Shared Lead Store");
    const delegates = within(list).getByRole("region", { name: "Delegates To" });
    expect(within(delegates).getAllByRole("button")[0]).toHaveTextContent("←Coordinatorbatches");
    const shares = within(list).getByRole("region", { name: "Shares Context With" });
    expect(within(shares).getAllByRole("button")[0]).toHaveTextContent("↔Discovery Agent");
  });

  it("offers no create, edit or delete controls", () => {
    renderInspector(fixture(), { componentIds: ["cmp_val"] });
    const list = relationshipsSection();

    const names = within(list)
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label") ?? "");
    expect(names.every((name) => /^(Open relationship: |Go to )/.test(name))).toBe(true);
    expect(within(list).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(list).queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("opens the relationship inspector when an entry is selected", async () => {
    const user = userEvent.setup();
    const { store } = renderInspector(fixture(), { componentIds: ["cmp_val"] });

    await user.click(screen.getByRole("button", { name: /Open relationship: Validation Agent reads from/ }));

    expect(store.getState().selection).toEqual({ componentIds: [], relationshipIds: ["rel_reads"], groupIds: [] });
    expect(screen.getByText("Relationship", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByLabelText("Type")).toHaveValue("reads_from");
  });

  it("goes to the other component", async () => {
    const user = userEvent.setup();
    const { store } = renderInspector(fixture(), { componentIds: ["cmp_val"] });

    await user.click(screen.getByRole("button", { name: "Go to Coordinator" }));

    expect(store.getState().selection.componentIds).toEqual(["cmp_orch"]);
    expect(screen.getByRole("heading", { name: "Coordinator" })).toBeInTheDocument();
  });

  it("shows the empty state", () => {
    renderInspector(fixture(), { componentIds: ["cmp_route"] });
    expect(screen.getByText(EMPTY_RELATIONSHIPS_TEXT)).toBeInTheDocument();
  });
});

describe("RelationshipInspector", () => {
  it("shows a fixed direction as read-only text for predefined types", () => {
    renderInspector(fixture(), { relationshipIds: ["rel_reads"] });

    expect(screen.getByText("Directed (fixed by type)")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Direction" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reverse direction" })).not.toBeInTheDocument();
    expect(screen.getByText("From", { selector: "strong" }).parentElement).toHaveTextContent(
      "From Validation Agent to Shared Lead Store",
    );
  });

  it("shows Shares Context With as undirected between both components", () => {
    renderInspector(fixture(), { relationshipIds: ["rel_share"] });

    expect(screen.getByText("Undirected (fixed by type)")).toBeInTheDocument();
    expect(screen.getByText("Between", { selector: "strong" }).parentElement).toHaveTextContent(
      "Between Discovery Agent and Validation Agent",
    );
    expect(screen.queryByRole("button", { name: "Reverse direction" })).not.toBeInTheDocument();
  });

  it("lets only generic relationships change direction and reverse", async () => {
    const user = userEvent.setup();
    const { store } = renderInspector(fixture(), { relationshipIds: ["rel_gen"] });

    expect(screen.getByRole("radio", { name: "Directed" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Reverse direction" }));
    expect(relationship(store, "rel_gen")).toMatchObject({ sourceId: "cmp_crm", targetId: "cmp_disc" });
    expect(screen.getByText("From", { selector: "strong" }).parentElement).toHaveTextContent(
      "From CRM to Discovery Agent",
    );

    await user.click(screen.getByRole("radio", { name: "Undirected" }));
    expect(store.dispatched.at(-1)?.command).toEqual({
      kind: "setRelationshipDirection",
      id: "rel_gen",
      direction: "undirected",
    });
    expect(screen.queryByRole("button", { name: "Reverse direction" })).not.toBeInTheDocument();
  });

  it("retypes and hides generic-only controls for fixed types", async () => {
    const user = userEvent.setup();
    const { store } = renderInspector(fixture(), { relationshipIds: ["rel_gen"] });

    await user.selectOptions(screen.getByLabelText("Type"), "Shares Context With");

    expect(relationship(store, "rel_gen")).toMatchObject({ type: "shares_context_with", direction: "undirected" });
    expect(screen.queryByRole("radiogroup", { name: "Direction" })).not.toBeInTheDocument();
    expect(screen.getByText("Undirected (fixed by type)")).toBeInTheDocument();
  });

  it("edits label and description with coalesce keys, selects endpoints and deletes", async () => {
    const user = userEvent.setup();
    const { store, actions } = renderInspector(fixture(), { relationshipIds: ["rel_reads"] });

    await user.type(screen.getByLabelText("Label"), "hot");
    expect(store.dispatched.at(-1)?.coalesceKey).toBe("rel_reads:label");
    expect(relationship(store, "rel_reads").label).toBe("hot");
    expect(screen.getByRole("heading", { name: "reads from · hot" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Description"), "x");
    expect(store.dispatched.at(-1)?.coalesceKey).toBe("rel_reads:description");

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(actions.deleteSelection).toHaveBeenCalledWith(store);

    await user.click(screen.getByRole("button", { name: "Shared Lead Store" }));
    expect(store.getState().selection.componentIds).toEqual(["cmp_store"]);
  });
});

function withVisual(id: string, visual: Record<string, unknown>): Architecture {
  const architecture = fixture();
  architecture.relationships = architecture.relationships.map((rel) => (rel.id === id ? { ...rel, visual } : rel));
  return architecture;
}

function renderWithRealStore(architecture: Architecture, relationshipId: string) {
  const store = createEditorStore(architecture);
  store.setSelection({ componentIds: [], relationshipIds: [relationshipId], groupIds: [] });
  const dispatch = vi.spyOn(store, "dispatch");
  render(
    <EditorProvider store={store}>
      <Inspector actions={createTestActions()} />
    </EditorProvider>,
  );
  return { store, dispatch };
}

function portsRow(): HTMLElement {
  return screen.getByText("Ports", { selector: "span" }).parentElement!.querySelector("p")!;
}

describe("RelationshipInspector ports row", () => {
  it("shows automatic ports without a reset button", () => {
    renderInspector(fixture(), { relationshipIds: ["rel_reads"] });

    expect(portsRow()).toHaveTextContent("Validation Agent: Automatic · Shared Lead Store: Automatic");
    expect(screen.queryByRole("button", { name: "Reset ports to automatic" })).not.toBeInTheDocument();
  });

  it("shows pinned sides by component name, source first, without an arrow glyph", () => {
    renderInspector(withVisual("rel_share", { ports: { source: "right", target: "left" } }), {
      relationshipIds: ["rel_share"],
    });

    expect(portsRow()).toHaveTextContent("Validation Agent: Right side · Discovery Agent: Left side");
    expect(portsRow().textContent).not.toMatch(/[→←↔]/);
    expect(screen.getByRole("button", { name: "Reset ports to automatic" })).toBeInTheDocument();
  });

  it("treats a single pin as partly automatic and malformed pins as automatic", () => {
    const view = renderInspector(withVisual("rel_reads", { ports: { target: "bottom" } }), {
      relationshipIds: ["rel_reads"],
    });
    expect(portsRow()).toHaveTextContent("Validation Agent: Automatic · Shared Lead Store: Bottom side");
    expect(screen.getByRole("button", { name: "Reset ports to automatic" })).toBeInTheDocument();
    view.unmount();

    renderInspector(withVisual("rel_reads", { ports: { source: "north", target: 3 } }), {
      relationshipIds: ["rel_reads"],
    });
    expect(portsRow()).toHaveTextContent("Validation Agent: Automatic · Shared Lead Store: Automatic");
    expect(screen.queryByRole("button", { name: "Reset ports to automatic" })).not.toBeInTheDocument();
  });

  it("resets the pins in one undo step and focuses the ports row", async () => {
    const user = userEvent.setup();
    const { store, dispatch } = renderWithRealStore(
      withVisual("rel_reads", { ports: { source: "top", target: "left" }, keep: 1 }),
      "rel_reads",
    );
    const rel = () => store.getState().architecture.relationships.find((r) => r.id === "rel_reads")!;

    await user.click(screen.getByRole("button", { name: "Reset ports to automatic" }));

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]?.[0]).toEqual({ kind: "setRelationshipPorts", id: "rel_reads", ports: null });
    expect(rel().visual).toEqual({ keep: 1 });
    expect(portsRow()).toHaveTextContent("Validation Agent: Automatic · Shared Lead Store: Automatic");
    expect(portsRow()).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Reset ports to automatic" })).not.toBeInTheDocument();

    act(() => void store.undo());
    expect(rel().visual).toEqual({ ports: { source: "top", target: "left" }, keep: 1 });
    expect(portsRow()).toHaveTextContent("Validation Agent: Top side · Shared Lead Store: Left side");
    expect(store.getState().canUndo).toBe(false);
  });
});
