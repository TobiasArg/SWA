import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { fixture, renderInspector } from "./testStore";

function component(store: ReturnType<typeof renderInspector>["store"], id: string) {
  return store.getState().architecture.components.find((c) => c.id === id)!;
}

describe("ComponentInspector — Agent / Orchestrator", () => {
  it("shows every agent field with a visible label", () => {
    renderInspector(fixture(), { componentIds: ["cmp_val"] });

    for (const label of [
      "Name",
      "Description",
      "Purpose",
      "Role",
      "Group",
      "Responsibilities",
      "Boundaries",
      "Activation",
      "Behavioral rules",
      "Delegation",
      "Outputs",
      "Failure handling",
      "Notes",
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByRole("radiogroup", { name: "Kind" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Validation Agent" })).toBeInTheDocument();
  });

  it("keeps purpose and role as separate behavior fields", async () => {
    const user = userEvent.setup();
    const { store } = renderInspector(fixture(), { componentIds: ["cmp_val"] });

    await user.clear(screen.getByLabelText("Purpose"));
    await user.type(screen.getByLabelText("Purpose"), "Check");

    expect(component(store, "cmp_val").behavior).toMatchObject({ purpose: "Check", role: "Validator" });
    expect(screen.getByLabelText("Role")).toHaveValue("Validator");
  });

  it("dispatches typing with one coalesce key and breaks coalescing on blur", async () => {
    const user = userEvent.setup();
    const { store } = renderInspector(fixture(), { componentIds: ["cmp_val"] });

    await user.type(screen.getByLabelText("Description"), "abc");
    const keys = store.dispatched.map((entry) => entry.coalesceKey);
    expect(keys).toEqual(["cmp_val:description", "cmp_val:description", "cmp_val:description"]);
    expect(component(store, "cmp_val").description).toBe("abc");

    const before = store.breakCount;
    await user.tab();
    expect(store.breakCount).toBe(before + 1);
  });

  it("removes an optional field when it is cleared", async () => {
    const user = userEvent.setup();
    const { store } = renderInspector(fixture(), { componentIds: ["cmp_val"] });

    await user.clear(screen.getByLabelText("Role"));

    expect(store.dispatched.at(-1)?.command).toEqual({
      kind: "updateBehavior",
      id: "cmp_val",
      patch: { role: undefined },
    });
    expect(component(store, "cmp_val").behavior).not.toHaveProperty("role");
  });

  it("requires a name: blank is not committed and blur restores the last valid value", async () => {
    const user = userEvent.setup();
    const { store } = renderInspector(fixture(), { componentIds: ["cmp_val"] });
    const name = screen.getByLabelText("Name");

    await user.clear(name);

    expect(screen.getByText("Name is required")).toBeInTheDocument();
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAccessibleDescription("Name is required");
    expect(store.dispatched).toHaveLength(0);

    await user.tab();
    expect(name).toHaveValue("Validation Agent");
    expect(screen.queryByText("Name is required")).not.toBeInTheDocument();
  });

  it("commits list fields as trimmed non-empty lines", async () => {
    const user = userEvent.setup();
    const { store } = renderInspector(fixture(), { componentIds: ["cmp_val"] });

    await user.type(screen.getByLabelText("Responsibilities"), "  Score leads {Enter}{Enter}Dedupe ");

    expect(component(store, "cmp_val").behavior?.responsibilities).toEqual(["Score leads", "Dedupe"]);
    expect(screen.getByLabelText("Responsibilities")).toHaveValue("  Score leads \n\nDedupe ");
  });

  it("switches Agent / Orchestrator without losing data", async () => {
    const user = userEvent.setup();
    const { store } = renderInspector(fixture(), { componentIds: ["cmp_val"] });

    await user.click(screen.getByRole("radio", { name: "Orchestrator" }));

    expect(component(store, "cmp_val")).toMatchObject({
      subtype: "orchestrator",
      behavior: { purpose: "Validate leads", role: "Validator" },
    });
    expect(screen.getByRole("radio", { name: "Orchestrator" })).toBeChecked();
    expect(screen.getByText("Orchestrator", { selector: "p" })).toBeInTheDocument();
  });

  it("re-syncs drafts when the stored value changes elsewhere (undo, other views)", () => {
    const { store } = renderInspector(fixture(), { componentIds: ["cmp_val"] });

    act(() => {
      store.dispatch({ kind: "updateBehavior", id: "cmp_val", patch: { purpose: "Restored" } });
    });

    expect(screen.getByLabelText("Purpose")).toHaveValue("Restored");
  });

  it("assigns the component to a group through the Group select", async () => {
    const user = userEvent.setup();
    const { store } = renderInspector(fixture(), { componentIds: ["cmp_val"] });
    const select = screen.getByLabelText("Group");

    expect(select).toHaveValue("");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "None",
      "Discovery Team",
      "Empty Group",
    ]);

    await user.selectOptions(select, "Empty Group");
    expect(store.dispatched.at(-1)?.command).toEqual({
      kind: "assignToGroup",
      componentIds: ["cmp_val"],
      groupId: "grp_b",
    });
    expect(select).toHaveValue("grp_b");

    await user.selectOptions(select, "None");
    expect(store.dispatched.at(-1)?.command).toMatchObject({ groupId: null });
  });

  it("edits links: rows without a URL stay local, unsafe URLs get no link", async () => {
    const user = userEvent.setup();
    const { store } = renderInspector(fixture(), { componentIds: ["cmp_val"] });

    await user.click(screen.getByRole("button", { name: "Add link" }));
    const row = screen.getByRole("group", { name: "Link 1" });
    await user.type(within(row).getByLabelText("Label"), "Docs");
    expect(component(store, "cmp_val").links).toBeUndefined();

    await user.type(within(row).getByLabelText("URL"), "https://example.com");
    expect(component(store, "cmp_val").links).toEqual([{ label: "Docs", url: "https://example.com" }]);
    expect(within(row).getByRole("link", { name: "Open link 1" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );

    await user.clear(within(row).getByLabelText("URL"));
    await user.type(within(row).getByLabelText("URL"), "javascript:alert(1)");
    expect(within(row).queryByRole("link")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove link 1" }));
    expect(component(store, "cmp_val").links).toBeUndefined();
  });

  it("wires Connect…, Duplicate and Delete to the shared actions", async () => {
    const user = userEvent.setup();
    const { store, actions } = renderInspector(fixture(), { componentIds: ["cmp_val"] });

    await user.click(screen.getByRole("button", { name: "Connect…" }));
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(actions.openConnectDialog).toHaveBeenCalledWith("cmp_val");
    expect(actions.duplicateSelection).toHaveBeenCalledWith(store);
    expect(actions.deleteSelection).toHaveBeenCalledWith(store);
  });
});

describe("ComponentInspector — other types", () => {
  it("shows tool fields and no agent behavior fields", async () => {
    const user = userEvent.setup();
    const { store } = renderInspector(fixture(), { componentIds: ["cmp_tool"] });

    expect(screen.queryByLabelText("Purpose")).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Kind" })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Technical reference"), "v2");
    expect(screen.getByLabelText("Inputs")).toBeInTheDocument();
    expect(screen.getByLabelText("Outputs")).toBeInTheDocument();
    expect(store.dispatched.at(-1)).toEqual({
      command: { kind: "setComponentProperty", id: "cmp_tool", key: "technicalReference", value: "v2" },
      coalesceKey: "cmp_tool:properties.technicalReference",
    });
  });

  it("uses enumerated selects for data stores and preserves unknown property keys", async () => {
    const user = userEvent.setup();
    const { store } = renderInspector(fixture(), { componentIds: ["cmp_store"] });
    const kind = screen.getByLabelText("Store kind");

    expect(kind).toHaveValue("vector");
    expect(within(kind).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Not set",
      "Memory",
      "Vector",
      "Relational",
      "File",
      "Other",
    ]);
    await user.selectOptions(screen.getByLabelText("Access scope"), "Private");
    await user.selectOptions(kind, "Not set");

    expect(component(store, "cmp_store").properties).toEqual({ accessScope: "private", futureKey: "kept" });
    expect(screen.getByLabelText("Contents")).toBeInTheDocument();
    expect(screen.getByLabelText("Access notes")).toBeInTheDocument();
  });

  it("shows external system fields and links a safe reference only", async () => {
    const user = userEvent.setup();
    renderInspector(fixture(), { componentIds: ["cmp_crm"] });

    expect(screen.getByLabelText("System kind")).toBeInTheDocument();
    expect(screen.getByLabelText("Boundary / ownership notes")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Reference link"), "https://crm.example");
    expect(screen.getByRole("link", { name: "Open reference link" })).toHaveAttribute(
      "href",
      "https://crm.example",
    );
  });

  it("shows decision fields", () => {
    renderInspector(fixture(), { componentIds: ["cmp_route"] });

    expect(screen.getByText("Decision / Routing Rule")).toBeInTheDocument();
    expect(screen.getByLabelText("Condition")).toBeInTheDocument();
    expect(screen.getByLabelText("Outcomes")).toBeInTheDocument();
  });
});
