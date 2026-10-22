import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Selection } from "../domain/types";
import { createEditorStore } from "../editor/store";
import type { EditorStore } from "../editor/storeTypes";
import { announce } from "../ui/LiveRegion";
import App from "./App";
import { defaultModules, defaultServices } from "./defaultServices";
import { createMemoryRepository, type MemoryRepository } from "./placeholders/persistence";
import { editorHref } from "./router";
import type { AppServices } from "./services";
import { installDialogPolyfill, makeFile } from "./testUtils";

beforeAll(() => {
  installDialogPolyfill();
  // React Flow measures its container; jsdom has no ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

describe("App with the real modules (IndexedDB via fake-indexeddb)", () => {
  it("creates an architecture, edits it in the editor and finds it in the library after leaving", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "#/");
    const { unmount } = render(<App />);

    await user.click(await screen.findByRole("button", { name: "New architecture" }));
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Integration Swarm{Enter}");

    const name = await screen.findByRole("textbox", { name: "Architecture name" });
    expect(name).toHaveValue("Integration Swarm");
    expect(await screen.findByText("Saved")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Agent$/ }));
    const toolbar = document.querySelector<HTMLElement>(".sa-toolbar")!;
    await waitFor(() => expect(within(toolbar).getByRole("button", { name: "Delete" })).toBeEnabled());

    await user.click(screen.getByRole("button", { name: "Library" }));
    const link = await screen.findByRole("link", { name: "Integration Swarm" });
    expect(link.closest("tr")).toHaveTextContent("1 component");

    // A fresh app instance reads the same browser storage (M7).
    unmount();
    act(() => window.history.replaceState(null, "", "#/"));
    render(<App />);
    expect(await screen.findByRole("link", { name: "Integration Swarm" })).toBeInTheDocument();
  });
});

/**
 * Every editor delete asks first (UI_COLOR_CONFIRMATION_DESIGN §2.3, AC-N1–N10). Real editor,
 * canvas and inspector modules over an in-memory repository; the store is captured so tests can
 * set selections that would otherwise need pointer interaction on the canvas.
 */
describe("editor delete confirmation", () => {
  const none: Selection = { componentIds: [], relationshipIds: [], groupIds: [] };
  const fixture = () =>
    makeFile({
      id: "arch_del",
      name: "Delete Fixture",
      components: [
        { id: "cmp_a", type: "agent", name: "Alpha", position: { x: 0, y: 0 } },
        { id: "cmp_b", type: "tool", name: "Bravo", position: { x: 400, y: 0 } },
        { id: "cmp_c", type: "memory", name: "Charlie", position: { x: 0, y: 400 } },
      ],
      relationships: [
        { id: "rel_ab", type: "uses", sourceId: "cmp_a", targetId: "cmp_b", direction: "directed" },
        { id: "rel_ac", type: "reads_from", sourceId: "cmp_a", targetId: "cmp_c", direction: "directed" },
        { id: "rel_ba", type: "depends_on", sourceId: "cmp_b", targetId: "cmp_a", direction: "directed" },
        { id: "rel_bc", type: "uses", sourceId: "cmp_b", targetId: "cmp_c", direction: "directed" },
      ],
      groups: [
        {
          id: "grp_1",
          name: "Team",
          memberComponentIds: ["cmp_b", "cmp_c"],
          bounds: { x: 376, y: -56, width: 268, height: 576 },
        },
      ],
    });

  let repository: MemoryRepository;
  let store: EditorStore;

  beforeEach(() => {
    window.localStorage.clear();
    announce(""); // The live region is module state shared across tests.
    repository = createMemoryRepository();
    repository.seed({ status: "ok", file: fixture() });
  });

  async function openEditor() {
    const services: AppServices = {
      ...defaultServices,
      openRepository: async () => repository,
      createEditorStore: (initial) => (store = createEditorStore(initial)),
      openTabSession: () => ({ close: () => undefined }),
      subscribeToRepositoryChanges: () => () => undefined,
      exportArchitectureJson: vi.fn(),
      exportArchitectureMarkdown: vi.fn(),
      exportPng: vi.fn(async () => undefined),
      requestPersistentStorage: vi.fn(),
    };
    window.history.replaceState(null, "", editorHref("arch_del"));
    render(<App services={services} modules={defaultModules} />);
    await screen.findByRole("textbox", { name: "Architecture name" });
    return userEvent.setup();
  }

  function select(selection: Partial<Selection>) {
    act(() => store.setSelection({ ...none, ...selection }));
  }

  function key(init: KeyboardEventInit, target: Element = document.activeElement ?? document.body) {
    act(() => {
      target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
    });
  }

  const toolbar = () => document.querySelector<HTMLElement>(".sa-toolbar")!;
  const inspector = () => screen.getByRole("complementary", { name: "Inspector" });
  const canvas = () => document.querySelector<HTMLElement>("[data-sa-canvas]")!;
  const ids = (list: { id: string }[]) => list.map((item) => item.id);
  // React Flow records the viewport on mount; deletions only concern the diagram content.
  const content = () => {
    const { components, relationships, groups } = store.getState().architecture;
    return { components, relationships, groups };
  };

  interface Route {
    name: string;
    selection: Partial<Selection>;
    title: string;
    confirmLabel: string;
    trigger(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement>;
  }

  const shortcut = (init: KeyboardEventInit) => async () => {
    canvas().focus();
    key(init);
    return canvas();
  };
  const click = (container: () => HTMLElement, name: string) => async (user: ReturnType<typeof userEvent.setup>) => {
    const button = within(container()).getByRole("button", { name });
    await user.click(button);
    return button;
  };
  const componentA = { componentIds: ["cmp_a"] };
  const groupOnly = { groupIds: ["grp_1"] };
  const routes: Route[] = [
    { name: "Delete key", selection: componentA, title: "Delete 1 component and 3 relationships?", confirmLabel: "Delete", trigger: shortcut({ key: "Delete" }) },
    { name: "Backspace key", selection: componentA, title: "Delete 1 component and 3 relationships?", confirmLabel: "Delete", trigger: shortcut({ key: "Backspace" }) },
    { name: "toolbar Delete", selection: componentA, title: "Delete 1 component and 3 relationships?", confirmLabel: "Delete", trigger: click(toolbar, "Delete") },
    { name: "component inspector Delete", selection: componentA, title: "Delete 1 component and 3 relationships?", confirmLabel: "Delete", trigger: click(inspector, "Delete") },
    { name: "relationship inspector Delete", selection: { relationshipIds: ["rel_bc"] }, title: "Delete 1 relationship?", confirmLabel: "Delete", trigger: click(inspector, "Delete") },
    { name: "multi-selection inspector Delete", selection: { componentIds: ["cmp_a", "cmp_c"] }, title: "Delete 2 components and 4 relationships?", confirmLabel: "Delete", trigger: click(inspector, "Delete") },
    { name: "group inspector Delete", selection: groupOnly, title: "Delete 1 group?", confirmLabel: "Delete", trigger: click(inspector, "Delete group (keeps members)") },
    { name: "toolbar Ungroup", selection: groupOnly, title: "Ungroup 1 group?", confirmLabel: "Ungroup", trigger: click(toolbar, "Ungroup") },
    { name: "Mod+Shift+G", selection: groupOnly, title: "Ungroup 1 group?", confirmLabel: "Ungroup", trigger: shortcut({ key: "G", ctrlKey: true, shiftKey: true }) },
  ];

  it.each(routes)("$name opens the confirmation and dispatches nothing until confirmed", async (route) => {
    const user = await openEditor();
    select(route.selection);
    const before = { ...store.getState(), content: content() };

    await route.trigger(user);
    const dialog = screen.getByRole("dialog", { name: route.title });
    expect(dialog).toHaveAccessibleDescription(/You can undo this/);
    expect(Array.from(dialog.querySelectorAll("button")).map((button) => button.textContent)).toEqual([
      "Cancel",
      route.confirmLabel,
    ]);
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    expect(content()).toEqual(before.content);
    expect(store.getState().canUndo).toBe(false);

    await user.click(within(dialog).getByRole("button", { name: route.confirmLabel }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(content()).not.toEqual(before.content);
    expect(canvas()).toHaveFocus();

    act(() => store.undo());
    expect(content()).toEqual(before.content);
  });

  it.each([
    ["the Cancel button", async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: "Cancel" }))],
    ["Enter on Cancel", async (user: ReturnType<typeof userEvent.setup>) => user.keyboard("{Enter}")],
    ["Escape", async (user: ReturnType<typeof userEvent.setup>) => user.keyboard("{Escape}")],
  ])("cancelling with %s changes nothing and returns focus to the opener", async (_, cancel) => {
    const user = await openEditor();
    select(componentA);
    const before = { ...store.getState(), content: content() };
    // Let the initial viewport save settle so the save status is a stable baseline.
    await waitFor(() => expect(toolbar()).toHaveTextContent("Saved"));
    const status = toolbar().textContent;

    const opener = await click(inspector, "Delete")(user);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await cancel(user);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(content()).toEqual(before.content);
    expect(store.getState().selection).toEqual(before.selection);
    expect(store.getState().canUndo).toBe(false);
    expect(store.getState().contentRevision).toBe(before.contentRevision);
    expect(toolbar().textContent).toBe(status);
    expect(document.querySelector(".sa-toast")).toBeNull();
    expect(document.querySelector(".sa-live-region")).toHaveTextContent(/^$/);
    expect(opener).toHaveFocus();
  });

  it("returns focus to the toolbar Delete button or the canvas after cancelling those routes", async () => {
    const user = await openEditor();
    select(componentA);
    const opener = await click(toolbar, "Delete")(user);
    await user.keyboard("{Escape}");
    expect(opener).toHaveFocus();

    await shortcut({ key: "Delete" })();
    await user.keyboard("{Escape}");
    expect(canvas()).toHaveFocus();
    expect(store.getState().canUndo).toBe(false);
  });

  it("confirms by keyboard, then shows the existing Undo toast and announcement; Undo restores everything", async () => {
    const user = await openEditor();
    select(componentA);
    const before = content();

    const opener = await click(inspector, "Delete")(user);
    expect(opener).toBeInTheDocument();
    await user.tab();
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" })).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(ids(store.getState().architecture.components)).toEqual(["cmp_b", "cmp_c"]);
    expect(ids(store.getState().architecture.relationships)).toEqual(["rel_bc"]);
    const message = "Deleted 1 component and 3 relationships.";
    expect(await screen.findAllByText(message)).toHaveLength(2); // toast + live region
    // The inspector that opened the dialog is gone; focus is on the canvas, not <body>.
    expect(canvas()).toHaveFocus();

    const toast = document.querySelector<HTMLElement>(".sa-toast")!;
    await user.click(within(toast).getByRole("button", { name: "Undo" }));
    expect(content()).toEqual(before);

    act(() => store.redo());
    key({ key: "z", ctrlKey: true }, document.body);
    expect(content()).toEqual(before);
  });

  it("confirms with Space and deletes exactly the selection that was shown", async () => {
    const user = await openEditor();
    select({ relationshipIds: ["rel_ab"] });
    const dispatch = vi.spyOn(store, "dispatch");

    await click(toolbar, "Delete")(user);
    expect(dispatch).not.toHaveBeenCalled();
    await user.tab();
    await user.keyboard(" ");

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]?.[0]).toEqual({ kind: "deleteElements", ...none, relationshipIds: ["rel_ab"] });
    expect(ids(store.getState().architecture.relationships)).toEqual(["rel_ac", "rel_ba", "rel_bc"]);
  });

  it("ignores shortcuts and toolbar clicks while the dialog is open", async () => {
    const user = await openEditor();
    select(componentA);
    const before = { ...store.getState(), content: content() };

    await click(toolbar, "Delete")(user);
    const dialog = screen.getByRole("dialog");
    key({ key: "Delete" }, dialog);
    key({ key: "Backspace" }, dialog);
    key({ key: "z", ctrlKey: true }, dialog);
    key({ key: "ArrowRight" }, dialog);
    act(() => within(toolbar()).getByRole("button", { name: "Delete" }).click());

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(content()).toEqual(before.content);
    expect(store.getState().canUndo).toBe(false);
  });

  it("opens no dialog for an empty selection or when ungrouping only components", async () => {
    const user = await openEditor();
    select(none);
    await shortcut({ key: "Delete" })();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(within(toolbar()).getByRole("button", { name: "Delete" })).toBeDisabled();

    select({ componentIds: ["cmp_b"] });
    await click(toolbar, "Ungroup")(user);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(store.getState().architecture.groups[0]?.memberComponentIds).toEqual(["cmp_c"]);
  });

  it("ungroups after confirmation: the group is gone, its members stay, and undo restores it", async () => {
    const user = await openEditor();
    select(groupOnly);
    const before = content();

    await click(toolbar, "Ungroup")(user);
    await user.click(within(screen.getByRole("dialog", { name: "Ungroup 1 group?" })).getByRole("button", { name: "Ungroup" }));
    expect(store.getState().architecture.groups).toEqual([]);
    expect(ids(store.getState().architecture.components)).toEqual(["cmp_a", "cmp_b", "cmp_c"]);

    key({ key: "z", ctrlKey: true }, document.body);
    expect(content()).toEqual(before);
  });

  async function deleteComponentA(user: ReturnType<typeof userEvent.setup>) {
    select(componentA);
    await click(toolbar, "Delete")(user);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(document.querySelector(".sa-toast")).toBeInTheDocument());
    expect(within(document.querySelector<HTMLElement>(".sa-toast")!).getByRole("button", { name: "Undo" })).toBeInTheDocument();
  }

  it("removes the deletion Undo toast after a later edit, so it cannot undo that edit", async () => {
    const user = await openEditor();
    await deleteComponentA(user);

    select({ componentIds: ["cmp_b"] });
    await shortcut({ key: "ArrowRight" })();
    expect(store.getState().architecture.components.find((item) => item.id === "cmp_b")?.position.x).toBeGreaterThan(400);
    expect(document.querySelector(".sa-toast")).not.toBeInTheDocument();

    key({ key: "z", ctrlKey: true }, document.body);
    expect(store.getState().architecture.components.find((item) => item.id === "cmp_b")?.position.x).toBe(400);
    expect(ids(store.getState().architecture.components)).toEqual(["cmp_b", "cmp_c"]);
    key({ key: "z", ctrlKey: true }, document.body);
    expect(ids(store.getState().architecture.components)).toEqual(["cmp_a", "cmp_b", "cmp_c"]);
  });

  it("dismisses the deletion Undo toast when leaving the editor", async () => {
    const user = await openEditor();
    await deleteComponentA(user);

    await user.click(screen.getByRole("button", { name: "Library" }));
    expect(await screen.findByRole("link", { name: "Delete Fixture" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
    expect(document.querySelector(".sa-toast")).not.toBeInTheDocument();
  });
});
