import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CanvasApiContext } from "../canvas/canvasApi";
import { EditorProvider } from "../editor/context";
import type { Component } from "../domain/types";
import { Palette, PALETTE_HINT } from "./Palette";
import { PALETTE_DRAG_MIME } from "./paletteItems";
import { makeCanvasApiDouble, makeStoreDouble } from "./testUtils";

// Canvas rect center is (600, 400) on screen; the double pans by (100, 50), so
// the flow-space center is (500, 350).
const RECT = { left: 200, top: 100, width: 800, height: 600 };

function setup(components: Component[] = [], collapsed = false) {
  const store = makeStoreDouble(components);
  const canvas = makeCanvasApiDouble(RECT);
  render(
    <EditorProvider store={store}>
      <CanvasApiContext.Provider value={canvas.api}>
        <Palette collapsed={collapsed} />
      </CanvasApiContext.Provider>
    </EditorProvider>,
  );
  const addedComponents = () =>
    store.dispatch.mock.calls.map(([command]) => {
      if (command.kind !== "addComponent") throw new Error(`unexpected ${command.kind}`);
      return command.component;
    });
  return { store, canvas, addedComponents };
}

const NAMES = ["Orchestrator", "Agent", "Tool", "Memory / Data Store", "External System", "Decision / Routing Rule"];

describe("Palette", () => {
  it("lists the six component types in order as described buttons in a labelled region", () => {
    setup();
    const region = screen.getByRole("navigation", { name: "Components" });
    const buttons = within(region).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual(NAMES);
    for (const [index, name] of NAMES.entries()) {
      const button = screen.getByRole("button", { name });
      expect(button).toBe(buttons[index]);
      expect(button).toHaveAttribute("type", "button");
      expect(button).toHaveAttribute("draggable", "true");
      expect(button).toHaveAccessibleDescription(PALETTE_HINT);
    }
  });

  it("keeps accessible names and tooltips when collapsed to icons", () => {
    setup([], true);
    for (const name of NAMES) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveAttribute("title", name);
      expect(button.textContent).toBe("");
    }
  });

  it("adds the clicked type centered on the canvas and selects it", async () => {
    const user = userEvent.setup();
    const { store, addedComponents } = setup([
      { id: "a1", type: "agent", subtype: "orchestrator", name: "Orchestrator", position: { x: 0, y: 0 } },
    ]);

    await user.click(screen.getByRole("button", { name: "Orchestrator" }));

    expect(store.dispatch).toHaveBeenCalledTimes(1);
    const [component] = addedComponents();
    if (!component) throw new Error("no component added");
    // Agent default size 220x88: (500 - 110, 350 - 44).
    expect(component).toEqual({
      id: component.id,
      type: "agent",
      subtype: "orchestrator",
      name: "Orchestrator 2",
      position: { x: 390, y: 306 },
    });
    expect(store.setSelection).toHaveBeenCalledWith({
      componentIds: [component.id],
      relationshipIds: [],
      groupIds: [],
    });
  });

  it("activates with Enter and Space", async () => {
    const user = userEvent.setup();
    const { store, addedComponents } = setup();
    screen.getByRole("button", { name: "Tool" }).focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(store.dispatch).toHaveBeenCalledTimes(2);
    // Tool default size 200x72: (500 - 100, 350 - 36), then +24.
    expect(addedComponents().map((c) => [c.type, c.position])).toEqual([
      ["tool", { x: 400, y: 314 }],
      ["tool", { x: 424, y: 338 }],
    ]);
  });

  it("offsets consecutive click-adds by 24 and resets after a viewport move", async () => {
    const user = userEvent.setup();
    const { canvas, addedComponents } = setup();
    const agent = screen.getByRole("button", { name: "Agent" });

    await user.click(agent);
    await user.click(agent);
    await user.click(screen.getByRole("button", { name: "Decision / Routing Rule" }));
    canvas.setPan({ x: 0, y: 0 });
    await user.click(agent);

    expect(addedComponents().map((c) => c.position)).toEqual([
      { x: 390, y: 306 },
      { x: 414, y: 330 },
      // Decision 200x80 centered at (500, 350), third in the run.
      { x: 448, y: 358 },
      // New center (600, 400): run restarts.
      { x: 490, y: 356 },
    ]);
  });

  it("resets the offset after any other editor change", async () => {
    const user = userEvent.setup();
    const { store, addedComponents } = setup();
    const agent = screen.getByRole("button", { name: "Agent" });

    await user.click(agent);
    const changed = { ...store.getState(), revision: 1 };
    store.getState.mockReturnValue(changed);
    await user.click(agent);

    expect(addedComponents().map((c) => c.position)).toEqual([
      { x: 390, y: 306 },
      { x: 390, y: 306 },
    ]);
  });

  it("falls back to the window center without a viewport element", async () => {
    const user = userEvent.setup();
    const { canvas, store } = setup();
    canvas.api.getViewportElement.mockReturnValue(null);
    await user.click(screen.getByRole("button", { name: "Agent" }));
    expect(canvas.api.screenToFlowPosition).toHaveBeenCalledWith({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    expect(store.dispatch).toHaveBeenCalledTimes(1);
  });

  it("writes the drag payload with copy effect on dragstart", () => {
    const { store } = setup();
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (format: string, value: string) => data.set(format, value),
      getData: (format: string) => data.get(format) ?? "",
      effectAllowed: "uninitialized",
    };

    fireEvent.dragStart(screen.getByRole("button", { name: "External System" }), { dataTransfer });

    expect(JSON.parse(data.get(PALETTE_DRAG_MIME) ?? "")).toEqual({ type: "external_system" });
    expect(dataTransfer.effectAllowed).toBe("copy");
    expect(store.dispatch).not.toHaveBeenCalled();
  });
});
