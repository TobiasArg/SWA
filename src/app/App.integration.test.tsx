import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Selection } from "../domain/types";
import { createEditorStore } from "../editor/store";
import type { EditorStore } from "../editor/storeTypes";
import { startAutosave } from "../persistence/autosave";
import type { DatabaseStatus } from "../persistence/db";
import { openSnapshotStore, type SnapshotStore } from "../persistence/snapshots";
import { announce } from "../ui/LiveRegion";
import { RESTORE_FLUSH_FAILED, RESTORE_RECOVERY_FAILED } from "../versions/VersionsDialog";
import App, { STORAGE_UNAVAILABLE_TITLE, UPGRADE_BLOCKED_MESSAGE, UPGRADE_BLOCKING_MESSAGE } from "./App";
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

    const opener = await click(inspector, "Delete")(user);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await cancel(user);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(content()).toEqual(before.content);
    expect(store.getState().selection).toEqual(before.selection);
    expect(store.getState().canUndo).toBe(false);
    expect(store.getState().contentRevision).toBe(before.contentRevision);
    // Cancelling saves nothing; a late viewport-only save under load may still be settling.
    await waitFor(() => expect(within(toolbar()).getByRole("status")).toHaveTextContent("Saved"));
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

/**
 * Quick Find, Arrange and Versions wired into the editor shell (ROADMAP_V2_DESIGN §8.4 S10), with
 * the real editor, canvas and inspector modules, an in-memory repository and a fake-indexeddb
 * versions store per test.
 */
describe("integrated Quick Find, Arrange and Versions", () => {
  const none: Selection = { componentIds: [], relationshipIds: [], groupIds: [] };
  const fixture = () =>
    makeFile({
      id: "arch_s10",
      name: "Integration Fixture",
      components: [
        { id: "cmp_a", type: "agent", name: "Alpha", position: { x: 0, y: 0 } },
        { id: "cmp_b", type: "tool", name: "Bravo", position: { x: 400, y: 120 } },
        { id: "cmp_c", type: "memory", name: "Crème Store", position: { x: 40, y: 500 } },
      ],
      relationships: [
        { id: "rel_ab", type: "uses", sourceId: "cmp_a", targetId: "cmp_b", direction: "directed" },
        { id: "rel_bc", type: "reads_from", sourceId: "cmp_b", targetId: "cmp_c", direction: "directed" },
      ],
      groups: [],
    });

  let repository: MemoryRepository;
  let store: EditorStore;
  let databaseName: string;
  let databaseCount = 0;
  let failFlush: boolean;

  beforeEach(() => {
    window.localStorage.clear();
    announce("");
    repository = createMemoryRepository();
    repository.seed({ status: "ok", file: fixture() });
    databaseName = `s10-versions-${(databaseCount += 1)}`;
    failFlush = false;
  });

  async function openEditor(overrides: Partial<AppServices> = {}) {
    const services: AppServices = {
      ...defaultServices,
      openRepository: async () => repository,
      createEditorStore: (initial) => (store = createEditorStore(initial)),
      startAutosave: (target, repo) => {
        const controller = startAutosave(target, repo);
        return { ...controller, flush: () => (failFlush ? Promise.resolve(false) : controller.flush()) };
      },
      openTabSession: () => ({ close: () => undefined }),
      subscribeToRepositoryChanges: () => () => undefined,
      exportArchitectureJson: vi.fn(),
      exportArchitectureMarkdown: vi.fn(),
      exportPng: vi.fn(async () => undefined),
      requestPersistentStorage: vi.fn(),
      openSnapshotStore: () => openSnapshotStore(databaseName),
      ...overrides,
    };
    window.history.replaceState(null, "", editorHref("arch_s10"));
    render(<App services={services} modules={defaultModules} />);
    await screen.findByRole("textbox", { name: "Architecture name" });
    return userEvent.setup();
  }

  function key(init: KeyboardEventInit, target: Element = document.activeElement ?? document.body) {
    act(() => {
      target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
    });
  }

  const toolbar = () => document.querySelector<HTMLElement>(".sa-toolbar")!;
  const canvas = () => document.querySelector<HTMLElement>("[data-sa-canvas]")!;
  const liveRegion = () => document.querySelector<HTMLElement>(".sa-live-region")!;
  const toast = () => document.querySelector<HTMLElement>(".sa-toast");
  const content = () => {
    const { components, relationships, groups } = store.getState().architecture;
    return { components, relationships, groups };
  };
  const componentIds = () => store.getState().architecture.components.map((component) => component.id);

  async function openVersions(user: ReturnType<typeof userEvent.setup>) {
    const button = within(toolbar()).getByRole("button", { name: "Versions" });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    const dialog = await screen.findByRole("dialog", { name: "Versions of 'Integration Fixture'" });
    await waitFor(() => expect(within(dialog).queryByText("Loading versions…")).not.toBeInTheDocument());
    return dialog;
  }

  async function deleteAlpha(user: ReturnType<typeof userEvent.setup>) {
    act(() => store.setSelection({ ...none, componentIds: ["cmp_a"] }));
    await user.click(within(toolbar()).getByRole("button", { name: "Delete" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(componentIds()).toEqual(["cmp_b", "cmp_c"]);
    await waitFor(() => expect(toolbar()).toHaveTextContent("Saved"));
  }

  /** Seeds a saved version of the fixture with only Bravo, so restore has a different target. */
  async function seedBravoOnlyVersion(): Promise<void> {
    const snapshots = await openSnapshotStore(databaseName);
    const file = fixture();
    file.architecture.components = file.architecture.components.filter((component) => component.id === "cmp_b");
    file.architecture.relationships = [];
    await snapshots.capture(file, "manual");
    snapshots.close();
  }

  it("Mod+K from the canvas and from a text field opens Quick Find; Enter selects, focuses and announces", async () => {
    const user = await openEditor();
    canvas().focus();
    key({ key: "k", ctrlKey: true });
    const dialog = screen.getByRole("dialog", { name: "Find component" });
    const input = within(dialog).getByRole("combobox", { name: "Component name" });
    expect(input).toHaveFocus();

    await user.type(input, "creme");
    await user.keyboard("{Enter}");
    // jsdom never settles React Flow's animated reveal, so the shell's reveal timeout applies.
    await waitFor(() => expect(liveRegion()).toHaveTextContent("Selected Crème Store."), { timeout: 3_000 });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(store.getState().selection).toEqual({ ...none, componentIds: ["cmp_c"] });
    expect(document.activeElement?.getAttribute("data-id") ?? document.activeElement).toSatisfy(
      (focused: unknown) => focused === "cmp_c" || focused === canvas(),
    );
    expect(store.getState().canUndo).toBe(false);

    // Mod+K also works from the name field, so a text field never traps navigation.
    const name = screen.getByRole("textbox", { name: "Architecture name" });
    name.focus();
    key({ key: "k", ctrlKey: true }, name);
    expect(screen.getByRole("dialog", { name: "Find component" })).toBeInTheDocument();
  });

  it("/ opens Quick Find outside text fields; Escape closes it without changes and returns focus", async () => {
    const user = await openEditor();
    const find = within(toolbar()).getByRole("button", { name: "Find component" });
    await user.click(find);
    expect(screen.getByRole("dialog", { name: "Find component" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(find).toHaveFocus();

    const name = screen.getByRole("textbox", { name: "Architecture name" });
    key({ key: "/" }, name);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    canvas().focus();
    key({ key: "/" });
    expect(screen.getByRole("dialog", { name: "Find component" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(canvas()).toHaveFocus();
    expect(store.getState().selection).toEqual(none);
  });

  it("Align top moves positions only, in one undo step, and announces it", async () => {
    const user = await openEditor();
    act(() => store.setSelection({ ...none, componentIds: ["cmp_a", "cmp_b", "cmp_c"] }));
    const before = content();

    await user.click(within(toolbar()).getByRole("button", { name: "Arrange" }));
    await user.click(screen.getByRole("menuitem", { name: /Align top/ }));
    const ys = store.getState().architecture.components.map((component) => component.position.y);
    expect(new Set(ys).size).toBe(1);
    expect(JSON.stringify(content().relationships)).toBe(JSON.stringify(before.relationships));
    expect(liveRegion()).toHaveTextContent("Aligned 3 items to the top.");
    expect(toast()).toBeNull();

    key({ key: "z", ctrlKey: true }, document.body);
    expect(content()).toEqual(before);
  });

  it("Tidy layout with nothing selected offers an entry-bound Undo toast that restores every position", async () => {
    const user = await openEditor();
    const before = content();

    await user.click(within(toolbar()).getByRole("button", { name: "Arrange" }));
    await user.click(screen.getByRole("menuitem", { name: /Tidy layout/ }));
    expect(content().components).not.toEqual(before.components);
    expect(JSON.stringify(content().relationships)).toBe(JSON.stringify(before.relationships));
    await waitFor(() => expect(toast()).toHaveTextContent("Tidied 3 items."));

    await user.click(within(toast()!).getByRole("button", { name: "Undo" }));
    expect(content()).toEqual(before);
    expect(liveRegion()).toHaveTextContent("Undid the tidy layout.");
    expect(toast()).toBeNull();
  });

  it("a later edit removes the Tidy Undo toast, so it cannot undo that edit", async () => {
    const user = await openEditor();
    await user.click(within(toolbar()).getByRole("button", { name: "Arrange" }));
    await user.click(screen.getByRole("menuitem", { name: /Tidy layout/ }));
    await waitFor(() => expect(toast()).toBeInTheDocument());

    act(() => store.setSelection({ ...none, componentIds: ["cmp_b"] }));
    canvas().focus();
    key({ key: "ArrowRight" });
    expect(toast()).toBeNull();
  });

  it("restores a version: recovery point first, diagram replaced, Undo toast returns to the pre-restore diagram", async () => {
    await seedBravoOnlyVersion();
    const user = await openEditor();
    // An edit after the open version, so the recovery point is a new "Before restore" version.
    await deleteAlpha(user);
    const preRestore = content();

    let dialog = await openVersions(user);
    // Newest first: the open version, then the seeded one.
    await user.click(within(dialog).getAllByRole("button", { name: /^Restore the version from/ })[1]!);
    const confirm = screen.getByRole("dialog", { name: /^Restore the version from .*\?$/ });
    expect(confirm).toHaveAccessibleDescription(/1 component · 0 relationships · 0 groups/);
    expect(within(confirm).getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.click(within(confirm).getByRole("button", { name: "Restore" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(componentIds()).toEqual(["cmp_b"]);
    expect(store.getState().architecture.name).toBe("Integration Fixture");
    expect(store.getState().selection).toEqual(none);
    expect(canvas()).toHaveFocus();
    expect(toast()).toHaveTextContent(/^Restored the version from /);
    expect(liveRegion()).toHaveTextContent(/^Restored the version from /);

    // The recovery version outlives the session and has the pre-restore counts.
    dialog = await openVersions(user);
    const recoveryRow = within(dialog).getByText("Before restore").closest("li")!;
    expect(recoveryRow).toHaveTextContent("2 components · 1 relationship · 0 groups");
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(within(toolbar()).getByRole("button", { name: "Versions" })).toHaveFocus();

    await user.click(within(toast()!).getByRole("button", { name: "Undo" }));
    expect(content()).toEqual(preRestore);
    expect(liveRegion()).toHaveTextContent("Undid the restore.");
  });

  it("Save version now reports a saved version, then no changes", async () => {
    const user = await openEditor();
    await deleteAlpha(user);
    const dialog = await openVersions(user);
    await user.click(within(dialog).getByRole("button", { name: "Save version now" }));
    expect(await within(dialog).findByText("Version saved.")).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Save version now" })).toBeEnabled());
    await user.click(within(dialog).getByRole("button", { name: "Save version now" }));
    expect(await within(dialog).findByText("No changes since the last version.")).toBeInTheDocument();
  });

  it("restore stops with an inline error and changes nothing when the latest changes cannot be saved", async () => {
    await seedBravoOnlyVersion();
    const user = await openEditor();
    const dialog = await openVersions(user);
    // The open version matches the current diagram, so it is marked Current and can't be restored.
    const current = within(dialog).getByText("Current").closest("li")!;
    expect(within(current).getByRole("button", { name: /^Restore the version from/ })).toBeDisabled();
    const before = content();
    failFlush = true;

    await user.click(within(dialog).getAllByRole("button", { name: /^Restore the version from/ })[1]!);
    const confirm = screen.getByRole("dialog", { name: /^Restore the version from/ });
    await user.click(within(confirm).getByRole("button", { name: "Restore" }));
    expect(await within(confirm).findByText(RESTORE_FLUSH_FAILED)).toBeInTheDocument();
    expect(content()).toEqual(before);
    expect(store.getState().canUndo).toBe(false);
  });

  it("restore stops with an inline error and changes nothing when the recovery version cannot be saved", async () => {
    await seedBravoOnlyVersion();
    const user = await openEditor({
      openSnapshotStore: async () => {
        const real: SnapshotStore = await openSnapshotStore(databaseName);
        return {
          ...real,
          capture: (file, trigger) =>
            trigger === "pre-restore" ? Promise.reject(new Error("Quota exceeded")) : real.capture(file, trigger),
        };
      },
    });
    const dialog = await openVersions(user);
    const before = content();

    await user.click(within(dialog).getAllByRole("button", { name: /^Restore the version from/ })[1]!);
    const confirm = screen.getByRole("dialog", { name: /^Restore the version from/ });
    await user.click(within(confirm).getByRole("button", { name: "Restore" }));
    expect(await within(confirm).findByText(RESTORE_RECOVERY_FAILED)).toBeInTheDocument();
    expect(content()).toEqual(before);
    expect(store.getState().canUndo).toBe(false);
  });

  it("captures a leave version after the flush when leaving the editor", async () => {
    const user = await openEditor();
    await deleteAlpha(user);
    await user.click(screen.getByRole("button", { name: "Library" }));
    expect(await screen.findByRole("link", { name: "Integration Fixture" })).toBeInTheDocument();

    const snapshots = await openSnapshotStore(databaseName);
    await waitFor(async () => {
      const items = await snapshots.list("arch_s10");
      expect(items.map((item) => (item.status === "ok" ? item.counts.components : -1))).toEqual([2, 3]);
    });
    snapshots.close();
  });

  it("shows the blocked-upgrade message instead of a blank or unavailable screen, then resumes", async () => {
    let resume!: () => void;
    const services: AppServices = {
      ...defaultServices,
      openRepository: (options) =>
        new Promise((resolve) => {
          options?.onStatus?.("blocked");
          resume = () => {
            options?.onStatus?.("open");
            resolve(repository);
          };
        }),
      subscribeToRepositoryChanges: () => () => undefined,
    };
    window.history.replaceState(null, "", "#/");
    render(<App services={services} modules={defaultModules} />);
    expect(await screen.findByText(UPGRADE_BLOCKED_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(STORAGE_UNAVAILABLE_TITLE)).not.toBeInTheDocument();

    act(() => resume());
    expect(await screen.findByRole("link", { name: "Integration Fixture" })).toBeInTheDocument();
    expect(screen.queryByText(UPGRADE_BLOCKED_MESSAGE)).not.toBeInTheDocument();
  });

  it("shows the reload banner when a newer version in another tab takes over, without remounting the editor", async () => {
    let report!: (status: DatabaseStatus) => void;
    await openEditor({
      openRepository: async (options) => {
        report = (status) => options?.onStatus?.(status);
        return repository;
      },
    });
    const editorStore = store;
    const nameField = screen.getByRole("textbox", { name: "Architecture name" });

    act(() => report("blocking"));
    expect(screen.getByRole("alert")).toHaveTextContent(UPGRADE_BLOCKING_MESSAGE);
    expect(within(screen.getByRole("alert")).getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Architecture name" })).toBe(nameField);
    expect(store).toBe(editorStore);
  });
});
