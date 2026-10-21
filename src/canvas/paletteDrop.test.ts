import { describe, expect, it, vi } from "vitest";
import { PALETTE_DRAG_MIME } from "../palette/paletteItems";
import { handlePaletteDragOver, handlePaletteDrop, hasPalettePayload } from "./paletteDrop";
import { createFakeStore } from "./testing/fakeStore";
import { buildFixtureArchitecture } from "./testing/fixtures";

function transfer(data: Record<string, string>) {
  return {
    types: Object.keys(data),
    getData: (format: string) => data[format] ?? "",
    dropEffect: "none",
  } as unknown as DataTransfer;
}

describe("palette drag over the canvas", () => {
  it("accepts palette drags as a copy", () => {
    const dataTransfer = transfer({ [PALETTE_DRAG_MIME]: "" });
    const preventDefault = vi.fn();
    expect(handlePaletteDragOver({ dataTransfer, preventDefault })).toBe(true);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(dataTransfer.dropEffect).toBe("copy");
  });

  it("ignores other drags (files, text)", () => {
    const preventDefault = vi.fn();
    expect(handlePaletteDragOver({ dataTransfer: transfer({ "text/plain": "x" }), preventDefault })).toBe(false);
    expect(handlePaletteDragOver({ dataTransfer: null, preventDefault })).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(hasPalettePayload(undefined)).toBe(false);
  });
});

describe("palette drop on the canvas", () => {
  const toFlow = (p: { x: number; y: number }) => ({ x: p.x - 100, y: p.y - 50 });

  it("adds ONE component at the drop point (flow coordinates) and selects it", () => {
    const store = createFakeStore(buildFixtureArchitecture());
    const id = handlePaletteDrop(
      store,
      {
        dataTransfer: transfer({ [PALETTE_DRAG_MIME]: JSON.stringify({ type: "tool" }) }),
        preventDefault: vi.fn(),
        clientX: 600,
        clientY: 400,
      },
      toFlow,
    );
    expect(store.commands).toHaveLength(1);
    const added = store.getState().architecture.components.find((c) => c.id === id)!;
    expect(added).toMatchObject({ type: "tool", name: "Tool", position: { x: 500, y: 350 } });
    expect(store.getState().selection.componentIds).toEqual([id]);
  });

  it("never changes group membership, even inside a group's bounds", () => {
    const architecture = buildFixtureArchitecture();
    const store = createFakeStore(architecture);
    const bounds = architecture.groups[0]!.bounds;
    handlePaletteDrop(
      store,
      {
        dataTransfer: transfer({ [PALETTE_DRAG_MIME]: JSON.stringify({ type: "agent", subtype: "orchestrator" }) }),
        preventDefault: vi.fn(),
        clientX: bounds.x + 140,
        clientY: bounds.y + 90,
      },
      toFlow,
    );
    expect(store.getState().architecture.groups).toEqual(architecture.groups);
  });

  it("ignores invalid payloads and non-palette drops", () => {
    const store = createFakeStore(buildFixtureArchitecture());
    const base = { preventDefault: vi.fn(), clientX: 0, clientY: 0 };
    expect(handlePaletteDrop(store, { ...base, dataTransfer: transfer({ [PALETTE_DRAG_MIME]: '{"type":"robot"}' }) }, toFlow)).toBeNull();
    expect(handlePaletteDrop(store, { ...base, dataTransfer: transfer({ "text/plain": "agent" }) }, toFlow)).toBeNull();
    expect(store.commands).toHaveLength(0);
  });
});
