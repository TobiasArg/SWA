import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { installDialogPolyfill } from "../app/testUtils";
import { EditorProvider } from "../editor/context";
import { ConnectDialog, connectTargets } from "./ConnectDialog";
import { createFakeStore, type FakeEditorStore } from "./testing/fakeStore";
import { buildFixtureArchitecture, emptyArchitecture, makeComponent } from "./testing/fixtures";

beforeAll(installDialogPolyfill);

function renderDialog(store: FakeEditorStore, sourceId: string | null, onClose = vi.fn()) {
  const view = render(
    <EditorProvider store={store}>
      <ConnectDialog open sourceId={sourceId} onClose={onClose} />
    </EditorProvider>,
  );
  return { ...view, onClose };
}

describe("connectTargets", () => {
  it("excludes the source and sorts by name", () => {
    const components = buildFixtureArchitecture().components;
    const names = connectTargets(components, "cmp_crm").map((c) => c.name);
    expect(names).not.toContain("CRM");
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(names).toHaveLength(components.length - 1);
  });
});

describe("ConnectDialog", () => {
  it("offers the 10 types (default Delegates To) and sorted targets without the source", () => {
    const store = createFakeStore(buildFixtureArchitecture());
    renderDialog(store, "cmp_crm");
    expect(screen.getByRole("dialog", { name: "Connect" })).toBeInTheDocument();
    const type = screen.getByLabelText<HTMLSelectElement>("Relationship type");
    expect(type.options).toHaveLength(10);
    expect(type.value).toBe("delegates_to");
    const target = screen.getByLabelText<HTMLSelectElement>("Target component");
    const names = Array.from(target.options).map((option) => option.textContent);
    expect(names).toEqual([
      "Discovery Agent",
      "Lead Orchestrator",
      "Lead Router",
      "Shared Lead Store",
      "Validation Agent",
      "Web Search",
    ]);
    expect(screen.getByText("CRM delegates to Discovery Agent.")).toBeInTheDocument();
    expect(screen.getByText(/^Directed \(fixed by type\)/)).toBeInTheDocument();
  });

  it("dispatches ONE addRelationship with the default direction, selects it and closes", async () => {
    const user = userEvent.setup();
    const store = createFakeStore(buildFixtureArchitecture());
    const { onClose } = renderDialog(store, "cmp_crm");
    await user.selectOptions(screen.getByLabelText("Relationship type"), "shares_context_with");
    await user.selectOptions(screen.getByLabelText("Target component"), "cmp_store");
    expect(screen.getByText(/^Undirected \(fixed by type\)/)).toBeInTheDocument();
    expect(screen.getByText("CRM and Shared Lead Store share context.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Connect" }));
    expect(store.commands).toHaveLength(1);
    const command = store.commands[0]!;
    expect(command).toMatchObject({
      kind: "addRelationship",
      relationship: { type: "shares_context_with", sourceId: "cmp_crm", targetId: "cmp_store", direction: "undirected" },
    });
    const id = command.kind === "addRelationship" ? command.relationship.id : "";
    expect(store.getState().selection).toEqual({ componentIds: [], relationshipIds: [id], groupIds: [] });
    expect(onClose).toHaveBeenCalled();
  });

  it("Cancel creates nothing", async () => {
    const user = userEvent.setup();
    const store = createFakeStore(buildFixtureArchitecture());
    const { onClose } = renderDialog(store, "cmp_crm");
    const buttons = screen.getAllByRole("button").map((button) => button.textContent);
    expect(buttons).toEqual(["Cancel", "Connect"]);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(store.commands).toHaveLength(0);
    expect(onClose).toHaveBeenCalled();
  });

  it("disables Connect when there is no other component", () => {
    const only = makeComponent({ id: "cmp_only", type: "agent", name: "Only" });
    const store = createFakeStore(emptyArchitecture({ components: [only] }));
    renderDialog(store, "cmp_only");
    expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled();
    fireEvent.submit(screen.getByLabelText("Target component").closest("form")!);
    expect(store.commands).toHaveLength(0);
  });

  it("resets to the defaults each time it opens", async () => {
    const user = userEvent.setup();
    const store = createFakeStore(buildFixtureArchitecture());
    const view = render(
      <EditorProvider store={store}>
        <ConnectDialog open sourceId="cmp_crm" onClose={() => {}} />
      </EditorProvider>,
    );
    await user.selectOptions(screen.getByLabelText("Relationship type"), "uses");
    const rerender = (open: boolean) =>
      view.rerender(
        <EditorProvider store={store}>
          <ConnectDialog open={open} sourceId="cmp_crm" onClose={() => {}} />
        </EditorProvider>,
      );
    rerender(false);
    rerender(true);
    expect(screen.getByLabelText<HTMLSelectElement>("Relationship type").value).toBe("delegates_to");
  });
});
