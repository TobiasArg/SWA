import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanvasApi } from "../canvas/canvasApi";
import type { Selection } from "../domain/types";
import { createPlaceholderEditorStore } from "./placeholders/editorStore";
import { createShortcutHandler, shortcutLabel, type ShortcutContext } from "./shortcuts";
import { makeArchitecture } from "./testUtils";

function setup(selection: Partial<Selection> = {}, isMac = false) {
  const store = createPlaceholderEditorStore(
    makeArchitecture({
      components: [
        { id: "a", type: "agent", name: "A", position: { x: 0, y: 0 } },
        { id: "b", type: "tool", name: "B", position: { x: 300, y: 0 } },
      ],
    }),
  );
  store.setSelection({ componentIds: [], relationshipIds: [], groupIds: [], ...selection });
  const api = { zoomIn: vi.fn(), zoomOut: vi.fn(), fitView: vi.fn() } as unknown as CanvasApi;
  const context = {
    store,
    isMac,
    getCanvasApi: () => api,
    undo: vi.fn(),
    redo: vi.fn(),
    deleteSelection: vi.fn(),
    duplicateSelection: vi.fn(),
    groupSelection: vi.fn(),
    ungroupSelection: vi.fn(),
    nudgeSelection: vi.fn(),
    openConnectDialog: vi.fn(),
    openQuickFind: vi.fn(),
    closeOverlay: vi.fn(() => false),
  } satisfies ShortcutContext;
  const handler = createShortcutHandler(context);
  const press = (init: KeyboardEventInit, target: EventTarget = document.body) => {
    const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
    Object.defineProperty(event, "target", { value: target });
    handler(event);
    return event;
  };
  return { context, api, store, press };
}

let input: HTMLInputElement;
let canvas: HTMLDivElement;

beforeEach(() => {
  input = document.createElement("input");
  canvas = document.createElement("div");
  canvas.dataset.saCanvas = "";
  const node = document.createElement("div");
  node.tabIndex = 0;
  canvas.append(node);
  document.body.append(input, canvas);
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("editor shortcuts (TD 6.7)", () => {
  it("undoes with Mod+Z and redoes with Mod+Shift+Z or Ctrl+Y, also inside text fields", () => {
    const { context, press } = setup();
    expect(press({ key: "z", ctrlKey: true }, input).defaultPrevented).toBe(true);
    press({ key: "Z", ctrlKey: true, shiftKey: true });
    press({ key: "y", ctrlKey: true }, input);
    expect(context.undo).toHaveBeenCalledTimes(1);
    expect(context.redo).toHaveBeenCalledTimes(2);
  });

  it("uses Cmd as Mod on macOS and ignores Ctrl+Z there", () => {
    const { context, press } = setup({}, true);
    press({ key: "z", ctrlKey: true });
    expect(context.undo).not.toHaveBeenCalled();
    press({ key: "z", metaKey: true });
    expect(context.undo).toHaveBeenCalledTimes(1);
    expect(shortcutLabel("Mod+Shift+G", true)).toBe("⌘⇧G");
    expect(shortcutLabel("Mod+Shift+G", false)).toBe("Ctrl+Shift+G");
  });

  it("deletes with Delete/Backspace except in editable focus", () => {
    const { context, press } = setup({ componentIds: ["a"] });
    press({ key: "Delete" });
    press({ key: "Backspace" });
    press({ key: "Backspace" }, input);
    expect(context.deleteSelection).toHaveBeenCalledTimes(2);
  });

  it("duplicates, groups and ungroups with Mod+D, Mod+G and Mod+Shift+G", () => {
    const { context, press } = setup({ componentIds: ["a"] });
    expect(press({ key: "d", ctrlKey: true }).defaultPrevented).toBe(true);
    press({ key: "g", ctrlKey: true });
    press({ key: "G", ctrlKey: true, shiftKey: true });
    press({ key: "d", ctrlKey: true }, input);
    expect(context.duplicateSelection).toHaveBeenCalledTimes(1);
    expect(context.groupSelection).toHaveBeenCalledTimes(1);
    expect(context.ungroupSelection).toHaveBeenCalledTimes(1);
  });

  it("opens Connect with C only when exactly one component is selected", () => {
    const one = setup({ componentIds: ["a"] });
    one.press({ key: "c" });
    one.press({ key: "c" }, input);
    expect(one.context.openConnectDialog).toHaveBeenCalledTimes(1);

    const two = setup({ componentIds: ["a", "b"] });
    two.press({ key: "c" });
    expect(two.context.openConnectDialog).not.toHaveBeenCalled();
  });

  it("nudges by 8px, or 40px with Shift, only when focus is on the canvas", () => {
    const { context, press } = setup({ componentIds: ["a"] });
    press({ key: "ArrowRight" }, canvas.firstChild as Element);
    press({ key: "ArrowUp", shiftKey: true }, canvas);
    press({ key: "ArrowLeft" }, document.body);
    expect(context.nudgeSelection.mock.calls).toEqual([
      [8, 0],
      [0, -40],
    ]);
  });

  it("zooms with Mod+= / Mod+- and fits with Shift+1", () => {
    const { api, press } = setup();
    press({ key: "=", ctrlKey: true });
    press({ key: "-", ctrlKey: true });
    press({ key: "!", code: "Digit1", shiftKey: true });
    press({ key: "=", ctrlKey: true }, input);
    expect(api.zoomIn).toHaveBeenCalledTimes(1);
    expect(api.zoomOut).toHaveBeenCalledTimes(1);
    expect(api.fitView).toHaveBeenCalledTimes(1);
  });

  it("Escape closes a shell overlay first, otherwise clears the selection", () => {
    const { context, store, press } = setup({ componentIds: ["a"] });
    context.closeOverlay.mockReturnValueOnce(true);
    press({ key: "Escape" });
    expect(store.getState().selection.componentIds).toEqual(["a"]);
    press({ key: "Escape" });
    expect(store.getState().selection.componentIds).toEqual([]);
  });

  it("ignores every shortcut while a modal dialog is open", () => {
    const { context, press } = setup({ componentIds: ["a"] });
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    document.body.append(dialog);
    press({ key: "z", ctrlKey: true });
    press({ key: "Delete" });
    expect(context.undo).not.toHaveBeenCalled();
    expect(context.deleteSelection).not.toHaveBeenCalled();
  });

  it("opens Quick Find with Mod+K from the canvas and from a text field (QF2)", () => {
    const { context, press } = setup();
    expect(press({ key: "k", ctrlKey: true }, canvas.firstChild as Element).defaultPrevented).toBe(true);
    expect(press({ key: "K", ctrlKey: true }, input).defaultPrevented).toBe(true);
    expect(context.openQuickFind).toHaveBeenCalledTimes(2);
  });

  it("opens Quick Find with / only outside editable focus", () => {
    const { context, press } = setup();
    expect(press({ key: "/" }).defaultPrevented).toBe(true);
    // Layouts where "/" needs Shift still match by key.
    press({ key: "/", shiftKey: true, code: "Digit7" }, canvas);
    expect(press({ key: "/" }, input).defaultPrevented).toBe(false);
    expect(context.openQuickFind).toHaveBeenCalledTimes(2);
  });

  it("does not open Quick Find with Alt, Shift, the other modifier, while composing or with a dialog open", () => {
    const { context, press } = setup();
    press({ key: "k", ctrlKey: true, altKey: true });
    press({ key: "K", ctrlKey: true, shiftKey: true });
    press({ key: "/", altKey: true });
    press({ key: "/", ctrlKey: true });
    press({ key: "k", ctrlKey: true, isComposing: true }, input);
    press({ key: "/", isComposing: true });
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    document.body.append(dialog);
    press({ key: "k", ctrlKey: true });
    press({ key: "/" });
    expect(context.openQuickFind).not.toHaveBeenCalled();
  });

  it("uses Cmd+K on macOS and ignores Ctrl+K there", () => {
    const { context, press } = setup({}, true);
    expect(press({ key: "k", ctrlKey: true }).defaultPrevented).toBe(false);
    press({ key: "k", ctrlKey: true, metaKey: true });
    expect(context.openQuickFind).not.toHaveBeenCalled();
    press({ key: "k", metaKey: true }, input);
    expect(context.openQuickFind).toHaveBeenCalledTimes(1);
  });
});
