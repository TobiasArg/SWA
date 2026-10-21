import { describe, expect, it } from "vitest";
import {
  PALETTE_DRAG_MIME,
  PALETTE_ITEMS,
  addComponentAt,
  createPaletteComponent,
  readPaletteDragPayload,
  writePaletteDragPayload,
} from "./paletteItems";
import { makeStoreDouble } from "./testUtils";
import type { Component } from "../domain/types";
import { DomainError } from "../domain/commands";

function transferWith(value: string | undefined) {
  return { getData: (format: string) => (format === PALETTE_DRAG_MIME && value !== undefined ? value : "") };
}

function existing(name: string, id = name): Component {
  return { id, type: "agent", name, position: { x: 0, y: 0 } };
}

describe("palette drag payload", () => {
  it("round-trips through write and read", () => {
    const store = new Map<string, string>();
    const dataTransfer = {
      setData: (format: string, value: string) => store.set(format, value),
      getData: (format: string) => store.get(format) ?? "",
      effectAllowed: "none",
    } as unknown as DataTransfer;

    writePaletteDragPayload(dataTransfer, { type: "agent", subtype: "orchestrator" });
    expect(dataTransfer.effectAllowed).toBe("copy");
    expect(JSON.parse(store.get(PALETTE_DRAG_MIME) ?? "")).toEqual({ type: "agent", subtype: "orchestrator" });
    expect(readPaletteDragPayload(dataTransfer)).toEqual({ type: "agent", subtype: "orchestrator" });

    writePaletteDragPayload(dataTransfer, { type: "memory" });
    expect(readPaletteDragPayload(dataTransfer)).toEqual({ type: "memory" });
  });

  it("accepts every palette item", () => {
    for (const item of PALETTE_ITEMS) {
      const payload = item.subtype ? { type: item.type, subtype: item.subtype } : { type: item.type };
      expect(readPaletteDragPayload(transferWith(JSON.stringify(payload)))).toEqual(payload);
    }
  });

  it.each([
    ["missing data", undefined],
    ["empty string", ""],
    ["not JSON", "agent"],
    ["JSON null", "null"],
    ["array", '["agent"]'],
    ["number", "42"],
    ["unknown type", '{"type":"robot"}'],
    ["display name instead of type", '{"type":"External System"}'],
    ["non-string type", '{"type":1}'],
    ["orchestrator subtype on a tool", '{"type":"tool","subtype":"orchestrator"}'],
    ["unknown subtype", '{"type":"agent","subtype":"boss"}'],
    ["null subtype", '{"type":"agent","subtype":null}'],
    ["extra keys", '{"type":"agent","name":"x"}'],
    ["prototype key", '{"type":"agent","__proto__":{"a":1}}'],
    ["oversized", JSON.stringify({ type: "agent", pad: "x".repeat(400) })],
  ])("rejects %s", (_label, value) => {
    expect(readPaletteDragPayload(transferWith(value))).toBeNull();
  });

  it("rejects a missing or throwing data transfer", () => {
    expect(readPaletteDragPayload(null)).toBeNull();
    expect(
      readPaletteDragPayload({
        getData: () => {
          throw new Error("protected");
        },
      }),
    ).toBeNull();
  });
});

describe("createPaletteComponent", () => {
  it("uses the default name, a cmp_ id and the given position, without size", () => {
    const component = createPaletteComponent({ type: "memory" }, { x: 10, y: 20 }, []);
    expect(component.id).toMatch(/^cmp_[0-9a-f-]{36}$/);
    expect(component).toEqual({ id: component.id, type: "memory", name: "Data Store", position: { x: 10, y: 20 } });
    expect(component).not.toHaveProperty("size");
    expect(component).not.toHaveProperty("subtype");
  });

  it("names the orchestrator and sets the subtype only for it", () => {
    const component = createPaletteComponent({ type: "agent", subtype: "orchestrator" }, { x: 0, y: 0 }, []);
    expect(component).toEqual({
      id: component.id,
      type: "agent",
      subtype: "orchestrator",
      name: "Orchestrator",
      position: { x: 0, y: 0 },
    });
    expect(component.id).toMatch(/^cmp_/);
  });

  it("adds the smallest free numeric suffix", () => {
    expect(createPaletteComponent({ type: "agent" }, { x: 0, y: 0 }, ["Agent"]).name).toBe("Agent 2");
    expect(createPaletteComponent({ type: "agent" }, { x: 0, y: 0 }, ["Agent", "Agent 2", "Agent 4"]).name).toBe(
      "Agent 3",
    );
    expect(createPaletteComponent({ type: "agent" }, { x: 0, y: 0 }, ["Agent 2"]).name).toBe("Agent");
    expect(createPaletteComponent({ type: "decision" }, { x: 0, y: 0 }, ["Agent", "Decision"]).name).toBe(
      "Decision 2",
    );
    expect(
      createPaletteComponent({ type: "agent", subtype: "orchestrator" }, { x: 0, y: 0 }, ["Orchestrator", "Orchestrator 2"])
        .name,
    ).toBe("Orchestrator 3");
  });
});

describe("addComponentAt", () => {
  it("dispatches one addComponent with a rounded top-left and selects the new component", () => {
    const store = makeStoreDouble([existing("Tool")]);
    const id = addComponentAt(store, { type: "tool" }, { x: 10.4, y: -3.6 });

    expect(store.dispatch).toHaveBeenCalledTimes(1);
    const command = store.dispatch.mock.calls[0]?.[0];
    expect(command).toEqual({
      kind: "addComponent",
      component: { id, type: "tool", name: "Tool 2", position: { x: 10, y: -4 } },
    });
    expect(store.setSelection).toHaveBeenCalledWith({ componentIds: [id], relationshipIds: [], groupIds: [] });
  });

  it("returns null and does not select when the store rejects the command", () => {
    const store = makeStoreDouble();
    store.dispatch.mockReturnValueOnce({ ok: false, error: new DomainError("x", "no") });
    expect(addComponentAt(store, { type: "agent" }, { x: 0, y: 0 })).toBeNull();
    expect(store.setSelection).not.toHaveBeenCalled();
  });
});
