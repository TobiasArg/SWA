import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createPlaceholderEditorStore } from "../app/placeholders/editorStore";
import { makeArchitecture } from "../app/testUtils";
import type { CanvasApi } from "../canvas/canvasApi";
import { EditorProvider } from "../editor/context";
import type { EditorStore } from "../editor/storeTypes";
import type { SaveController, SaveStatus } from "../persistence/types";
import { Toolbar, type ToolbarProps } from "./Toolbar";

function fakeController(initial: SaveStatus = "saved") {
  let status = { status: initial, error: undefined as string | undefined };
  const listeners = new Set<() => void>();
  const controller: SaveController = {
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    flush: vi.fn(async () => true),
    retry: vi.fn(),
    dispose: vi.fn(),
  };
  const set = (next: SaveStatus, error?: string) => {
    status = { status: next, error };
    act(() => listeners.forEach((listener) => listener()));
  };
  return { controller, set };
}

function renderToolbar(store: EditorStore, overrides: Partial<ToolbarProps> = {}) {
  const { controller, set } = fakeController();
  const props: ToolbarProps = {
    saveController: controller,
    canvasApi: null,
    formatShortcut: (shortcut) => shortcut,
    onBack: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onGroup: vi.fn(),
    onUngroup: vi.fn(),
    onConnect: vi.fn(),
    onDelete: vi.fn(),
    onFind: vi.fn(),
    onAlign: vi.fn(),
    onDistribute: vi.fn(),
    onTidy: vi.fn(),
    onOpenVersions: vi.fn(),
    onExportJson: vi.fn(),
    onExportMarkdown: vi.fn(),
    onExportPng: vi.fn(async () => undefined),
    onImport: vi.fn(),
    ...overrides,
  };
  render(
    <EditorProvider store={store}>
      <Toolbar {...props} />
    </EditorProvider>,
  );
  return { props, controller, setStatus: set };
}

const twoComponents = () =>
  createPlaceholderEditorStore(
    makeArchitecture({
      components: [
        { id: "a", type: "agent", name: "A", position: { x: 0, y: 0 } },
        { id: "b", type: "tool", name: "B", position: { x: 300, y: 0 } },
      ],
      groups: [{ id: "g", name: "Group", memberComponentIds: ["a"], bounds: { x: 0, y: 0, width: 10, height: 10 } }],
    }),
  );

describe("SaveStatusIndicator", () => {
  it("shows Saved, Saving… and Save failed with Retry", async () => {
    const user = userEvent.setup();
    const { controller, setStatus } = renderToolbar(twoComponents());
    expect(screen.getByRole("status")).toHaveTextContent("Saved");

    setStatus("pending");
    expect(screen.getByRole("status")).toHaveTextContent("Saving…");
    setStatus("saving");
    expect(screen.getByRole("status")).toHaveTextContent("Saving…");

    setStatus("error", "Quota exceeded");
    expect(screen.getByRole("status")).toHaveTextContent("Save failed");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(controller.retry).toHaveBeenCalled();
  });
});

describe("Toolbar", () => {
  it("enables undo/redo and selection actions from the editor state", async () => {
    const user = userEvent.setup();
    const store = twoComponents();
    const { props } = renderToolbar(store);

    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Group" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ungroup" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Connect…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();

    act(() => store.setSelection({ componentIds: ["a"], relationshipIds: [], groupIds: [] }));
    expect(screen.getByRole("button", { name: "Group" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Ungroup" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Connect…" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(props.onDelete).toHaveBeenCalled();

    act(() => store.setSelection({ componentIds: ["b"], relationshipIds: [], groupIds: [] }));
    expect(screen.getByRole("button", { name: "Ungroup" })).toBeDisabled();

    act(() => {
      store.dispatch({ kind: "deleteElements", componentIds: ["b"], relationshipIds: [], groupIds: [] });
    });
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(props.onUndo).toHaveBeenCalled();
  });

  it("describes buttons with their shortcuts", () => {
    renderToolbar(twoComponents());
    expect(screen.getByRole("button", { name: "Undo" })).toHaveAccessibleDescription("Mod+Z");
    expect(screen.getByRole("button", { name: "Fit to content" })).toHaveAccessibleDescription("Shift+1");
  });

  it("drives zoom and fit through the canvas API", async () => {
    const user = userEvent.setup();
    const api = { zoomIn: vi.fn(), zoomOut: vi.fn(), fitView: vi.fn() } as unknown as CanvasApi;
    renderToolbar(twoComponents(), { canvasApi: api });
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    await user.click(screen.getByRole("button", { name: "Zoom out" }));
    await user.click(screen.getByRole("button", { name: "Fit to content" }));
    expect(api.zoomIn).toHaveBeenCalled();
    expect(api.zoomOut).toHaveBeenCalled();
    expect(api.fitView).toHaveBeenCalled();
  });

  it("renames on Enter and reverts on Escape or blank names", async () => {
    const user = userEvent.setup();
    const store = twoComponents();
    renderToolbar(store);
    const input = screen.getByRole("textbox", { name: "Architecture name" });

    await user.clear(input);
    await user.type(input, "Renamed{Enter}");
    expect(store.getState().architecture.name).toBe("Renamed");

    await user.clear(input);
    await user.type(input, "Discarded{Escape}");
    expect(store.getState().architecture.name).toBe("Renamed");
    expect(input).toHaveValue("Renamed");

    await user.clear(input);
    await user.tab();
    expect(store.getState().architecture.name).toBe("Renamed");
    expect(input).toHaveValue("Renamed");
  });

  it("offers JSON and PNG export, disabling PNG for an empty diagram", async () => {
    const user = userEvent.setup();
    const { props } = renderToolbar(twoComponents());
    await user.click(screen.getByRole("button", { name: "Export" }));
    expect(screen.getByRole("menuitem", { name: "JSON file" })).toHaveFocus();
    await user.click(screen.getByRole("menuitem", { name: "JSON file" }));
    expect(props.onExportJson).toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(screen.getByRole("menuitem", { name: "PNG image" }));
    expect(props.onExportPng).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toHaveFocus();
  });

  it("offers a Markdown export reachable by keyboard, closing the menu and refocusing the trigger", async () => {
    const user = userEvent.setup();
    const { props } = renderToolbar(twoComponents());
    const trigger = screen.getByRole("button", { name: "Export" });
    await user.click(trigger);
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "JSON file",
      "Markdown document",
      "PNG image",
    ]);
    expect(screen.getByRole("menuitem", { name: "JSON file" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Markdown document" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(props.onExportMarkdown).toHaveBeenCalledTimes(1);
    expect(props.onExportJson).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("disables PNG export when there is nothing to export", async () => {
    const user = userEvent.setup();
    renderToolbar(createPlaceholderEditorStore(makeArchitecture()));
    await user.click(screen.getByRole("button", { name: "Export" }));
    expect(screen.getByRole("menuitem", { name: /PNG image/ })).toBeDisabled();
    expect(screen.getByText("Nothing to export")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Markdown document" })).toBeEnabled();
  });

  it("passes the chosen import file on", async () => {
    const user = userEvent.setup();
    const { props } = renderToolbar(twoComponents());
    const file = new File(["{}"], "a.json", { type: "application/json" });
    await user.upload(document.querySelector<HTMLInputElement>("input[type='file']")!, file);
    expect(props.onImport).toHaveBeenCalledWith(file);
  });

  it("opens Quick Find and Versions, and describes Find with Mod+K", async () => {
    const user = userEvent.setup();
    const { props } = renderToolbar(twoComponents());
    const find = screen.getByRole("button", { name: "Find component" });
    expect(find).toHaveAccessibleDescription("Mod+K");
    expect(find.closest("[role='group']")).toHaveAccessibleName("History and view");
    await user.click(find);
    expect(props.onFind).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Versions" }));
    expect(props.onOpenVersions).toHaveBeenCalledTimes(1);
  });

  it("disables Versions when no versions store is available", () => {
    renderToolbar(twoComponents(), { onOpenVersions: undefined });
    expect(screen.getByRole("button", { name: "Versions" })).toBeDisabled();
  });

  it("feeds the Arrange menu the selection's units and forwards its actions", async () => {
    const user = userEvent.setup();
    const store = twoComponents();
    const { props } = renderToolbar(store);
    await user.click(screen.getByRole("button", { name: "Arrange" }));
    expect(screen.getByRole("menuitem", { name: /Align left/ })).toBeDisabled();
    // Nothing selected: Tidy covers the whole diagram (2 top-level units).
    await user.click(screen.getByRole("menuitem", { name: /Tidy layout/ }));
    expect(props.onTidy).toHaveBeenCalledTimes(1);

    act(() => store.setSelection({ componentIds: ["a", "b"], relationshipIds: [], groupIds: [] }));
    await user.click(screen.getByRole("button", { name: "Arrange" }));
    await user.click(screen.getByRole("menuitem", { name: /Align top/ }));
    expect(props.onAlign).toHaveBeenCalledWith("top");
    await user.click(screen.getByRole("button", { name: "Arrange" }));
    expect(screen.getByRole("menuitem", { name: /Distribute horizontally/ })).toBeDisabled();
  });
});
