import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { EMPTY_GROUP_TEXT } from "./GroupInspector";
import { fixture, renderInspector } from "./testStore";

describe("ArchitectureInspector", () => {
  it("shows counts and renames without history when nothing is selected", async () => {
    const user = userEvent.setup();
    const { store } = renderInspector(fixture());

    expect(screen.getByRole("region", { name: "Inspector" })).toBeInTheDocument();
    expect(screen.getByText("7 components")).toBeInTheDocument();
    expect(screen.getByText("4 relationships")).toBeInTheDocument();
    expect(screen.getByText("2 groups")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Name"), "!");
    await user.type(screen.getByLabelText("Description"), "d");

    expect(store.getState().architecture).toMatchObject({ name: "Lead Hunting Engine!", description: "d" });
    expect(store.dispatched).toHaveLength(0);
  });
});

describe("GroupInspector", () => {
  it("lists members, selects and removes them, and deletes the group", async () => {
    const user = userEvent.setup();
    const { store, actions } = renderInspector(fixture(), { groupIds: ["grp_a"] });

    expect(screen.getByText("Members (2)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove Web Search from group" }));
    expect(store.dispatched.at(-1)?.command).toEqual({
      kind: "assignToGroup",
      componentIds: ["cmp_tool"],
      groupId: null,
    });
    expect(screen.getByText("Members (1)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete group (keeps members)" }));
    expect(actions.deleteSelection).toHaveBeenCalledWith(store);

    await user.click(screen.getByRole("button", { name: "Discovery Agent" }));
    expect(store.getState().selection.componentIds).toEqual(["cmp_disc"]);
  });

  it("edits name (required), description and notes; shows the empty state", async () => {
    const user = userEvent.setup();
    const { store } = renderInspector(fixture(), { groupIds: ["grp_b"] });

    expect(screen.getByText(EMPTY_GROUP_TEXT)).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Name"));
    expect(screen.getByText("Name is required")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Name"), "Ops");
    await user.type(screen.getByLabelText("Notes"), "n");

    expect(store.getState().architecture.groups[1]).toMatchObject({ name: "Ops", notes: "n" });
    expect(store.dispatched.map((d) => d.coalesceKey)).toContain("grp_b:name");
  });
});

describe("MultiSelectionInspector", () => {
  it("summarizes the selection and wires group, ungroup, duplicate and delete", async () => {
    const user = userEvent.setup();
    const { store, actions } = renderInspector(fixture(), {
      componentIds: ["cmp_disc", "cmp_val"],
      relationshipIds: ["rel_reads"],
    });

    expect(screen.getByText("2 components, 1 relationship, 0 groups selected")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Group selected components" }));
    expect(actions.groupSelection).toHaveBeenCalledWith(store);

    await user.click(screen.getByRole("button", { name: "Duplicate components" }));
    expect(actions.duplicateSelection).toHaveBeenCalledWith(store);

    await user.click(screen.getByRole("button", { name: "Remove from groups" }));
    expect(store.dispatched.at(-1)?.command).toEqual({
      kind: "assignToGroup",
      componentIds: ["cmp_disc"],
      groupId: null,
    });
    expect(screen.getByRole("button", { name: "Remove from groups" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(actions.deleteSelection).toHaveBeenCalledWith(store);
  });

  it("disables component-only actions without components", () => {
    renderInspector(fixture(), { relationshipIds: ["rel_reads", "rel_gen"] });

    expect(screen.getByRole("button", { name: "Group selected components" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Duplicate components" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
  });
});
