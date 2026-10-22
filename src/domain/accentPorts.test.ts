import { describe, expect, it } from "vitest";
import { ACCENT_IDS, ACCENTS } from "./constants";
import { DomainError, type Command } from "./commands";
import { applyCommand } from "./operations";
import { PORT_SIDES, readPortPins } from "./ports";
import type { Architecture, Relationship } from "./types";
import { DEFAULT_COMMAND_LABELS } from "../editor/commandLabels";
import { createEditorStore } from "../editor/store";

function base(extra: Partial<Relationship> = {}): Architecture {
  return {
    id: "arch",
    name: "A",
    createdAt: "2026-10-21T00:00:00Z",
    updatedAt: "2026-10-21T00:00:00Z",
    components: [
      { id: "a", type: "agent", name: "A", position: { x: 0, y: 0 } },
      { id: "b", type: "tool", name: "B", position: { x: 300, y: 0 } },
    ],
    relationships: [
      { id: "r", type: "generic", sourceId: "a", targetId: "b", direction: "directed", ...extra },
    ],
    groups: [{ id: "g", name: "G", memberComponentIds: [], bounds: { x: 0, y: 0, width: 10, height: 10 } }],
  };
}

function code(architecture: Architecture, command: Command): string | undefined {
  try {
    applyCommand(architecture, command);
  } catch (error) {
    return error instanceof DomainError ? error.code : "other";
  }
  return undefined;
}

describe("accent palette constants", () => {
  it("lists 16 ids in order with matching ACCENTS entries", () => {
    expect(ACCENT_IDS).toHaveLength(16);
    expect(ACCENT_IDS[0]).toBe("tomato");
    expect(ACCENT_IDS[15]).toBe("cocoa");
    expect(Object.keys(ACCENTS)).toEqual([...ACCENT_IDS]);
    expect(ACCENTS.teal).toEqual({ label: "Teal", ink: "#106A6E", tint: "#C9EAEA" });
  });
});

describe("setComponentAccent", () => {
  it("sets and clears accents, is a no-op when unchanged", () => {
    const arch = base();
    const set = applyCommand(arch, { kind: "setComponentAccent", ids: ["a", "b"], accent: "teal" }).architecture;
    expect(set.components.map((c) => c.accent)).toEqual(["teal", "teal"]);
    expect(arch.components[0]).not.toHaveProperty("accent");

    expect(applyCommand(set, { kind: "setComponentAccent", ids: ["a"], accent: "teal" }).architecture).toBe(set);
    expect(
      applyCommand(arch, { kind: "setComponentAccent", ids: ["a"], accent: undefined }).architecture,
    ).toBe(arch);

    const cleared = applyCommand(set, { kind: "setComponentAccent", ids: ["a"], accent: undefined }).architecture;
    expect(cleared.components[0]).not.toHaveProperty("accent");
    expect(cleared.components[1]?.accent).toBe("teal");
  });

  it("rejects unknown ids, group ids and invalid accents", () => {
    const arch = base();
    expect(code(arch, { kind: "setComponentAccent", ids: ["nope"], accent: "teal" })).toBe("E_COMPONENT_NOT_FOUND");
    expect(code(arch, { kind: "setComponentAccent", ids: ["g"], accent: "teal" })).toBe("E_COMPONENT_NOT_FOUND");
    expect(code(arch, { kind: "setComponentAccent", ids: ["a"], accent: "pink" as never })).toBe("E_INVALID_ACCENT");
  });

  it("creates one undo entry labelled 'Change color'", () => {
    const store = createEditorStore(base());
    store.dispatch({ kind: "setComponentAccent", ids: ["a", "b"], accent: "plum" });
    expect(store.getState().architecture.components.map((c) => c.accent)).toEqual(["plum", "plum"]);
    expect(DEFAULT_COMMAND_LABELS.setComponentAccent).toBe("Change color");
    store.undo();
    expect(store.getState().canUndo).toBe(false);
    expect(store.getState().architecture.components.some((c) => c.accent !== undefined)).toBe(false);
  });

  it("is copied by duplicateComponents and accepted by addComponent", () => {
    const arch = applyCommand(base(), { kind: "setComponentAccent", ids: ["a"], accent: "rose" }).architecture;
    const dup = applyCommand(arch, { kind: "duplicateComponents", items: [{ sourceId: "a", newId: "a2" }] });
    expect(dup.architecture.components.find((c) => c.id === "a2")?.accent).toBe("rose");
    expect(
      code(base(), {
        kind: "addComponent",
        component: { id: "x", type: "tool", name: "X", position: { x: 0, y: 0 }, accent: "bad" as never },
      }),
    ).toBe("E_INVALID_ACCENT");
  });
});

describe("readPortPins", () => {
  it("returns valid sides and ignores everything else", () => {
    expect(PORT_SIDES).toEqual(["top", "right", "bottom", "left"]);
    expect(readPortPins(undefined)).toEqual({});
    expect(readPortPins({ ports: { source: "right", target: "left" } })).toEqual({ source: "right", target: "left" });
    expect(readPortPins({ ports: { source: "north", target: 3 } })).toEqual({});
    expect(readPortPins({ ports: "right" })).toEqual({});
    expect(readPortPins({ ports: [1] })).toEqual({});
    expect(readPortPins({ ports: { target: "top" } })).toEqual({ target: "top" });
  });
});

describe("setRelationshipPorts", () => {
  it("replaces only visual.ports and keeps other visual keys", () => {
    const arch = base({ visual: { custom: 1, ports: { source: "top" } } });
    const next = applyCommand(arch, {
      kind: "setRelationshipPorts",
      id: "r",
      ports: { source: "right", target: "left" },
    }).architecture;
    expect(next.relationships[0]?.visual).toEqual({ custom: 1, ports: { source: "right", target: "left" } });
    expect(arch.relationships[0]?.visual).toEqual({ custom: 1, ports: { source: "top" } });
  });

  it("null removes ports and drops an empty visual", () => {
    const only = base({ visual: { ports: { source: "top" } } });
    const cleared = applyCommand(only, { kind: "setRelationshipPorts", id: "r", ports: null }).architecture;
    expect(cleared.relationships[0]).not.toHaveProperty("visual");

    const mixed = base({ visual: { custom: 1, ports: { source: "top" } } });
    const kept = applyCommand(mixed, { kind: "setRelationshipPorts", id: "r", ports: null }).architecture;
    expect(kept.relationships[0]?.visual).toEqual({ custom: 1 });
  });

  it("is a no-op when nothing changes and validates input", () => {
    const arch = base();
    expect(applyCommand(arch, { kind: "setRelationshipPorts", id: "r", ports: null }).architecture).toBe(arch);
    const pinned = base({ visual: { ports: { source: "top" } } });
    expect(
      applyCommand(pinned, { kind: "setRelationshipPorts", id: "r", ports: { source: "top" } }).architecture,
    ).toBe(pinned);
    expect(code(arch, { kind: "setRelationshipPorts", id: "zz", ports: null })).toBe("E_RELATIONSHIP_NOT_FOUND");
    expect(
      code(arch, { kind: "setRelationshipPorts", id: "r", ports: { source: "middle" as never } }),
    ).toBe("E_INVALID_PORT");
  });

  it("is labelled 'Reset relationship ports' and undoes in one step", () => {
    const store = createEditorStore(base({ visual: { ports: { source: "top" } } }));
    store.dispatch({ kind: "setRelationshipPorts", id: "r", ports: null });
    expect(store.getState().architecture.relationships[0]).not.toHaveProperty("visual");
    expect(DEFAULT_COMMAND_LABELS.setRelationshipPorts).toBe("Reset relationship ports");
    store.undo();
    expect(store.getState().canUndo).toBe(false);
    expect(store.getState().architecture.relationships[0]?.visual).toEqual({ ports: { source: "top" } });
  });
});

describe("relationship commands and visual", () => {
  it("addRelationship carries port pins", () => {
    const arch = base();
    const next = applyCommand(arch, {
      kind: "addRelationship",
      relationship: {
        id: "r2",
        type: "uses",
        sourceId: "a",
        targetId: "b",
        direction: "directed",
        visual: { ports: { source: "right" } },
      },
    }).architecture;
    expect(next.relationships[1]?.visual).toEqual({ ports: { source: "right" } });
  });

  it("reverseRelationship swaps pins with the ids and preserves other keys", () => {
    const arch = base({ visual: { custom: 1, ports: { source: "right", target: "left" } } });
    const rev = applyCommand(arch, { kind: "reverseRelationship", id: "r" }).architecture.relationships[0]!;
    expect([rev.sourceId, rev.targetId]).toEqual(["b", "a"]);
    expect(rev.visual).toEqual({ custom: 1, ports: { source: "left", target: "right" } });

    const half = base({ visual: { ports: { source: "right" } } });
    expect(applyCommand(half, { kind: "reverseRelationship", id: "r" }).architecture.relationships[0]?.visual).toEqual({
      ports: { target: "right" },
    });

    const invalid = base({ visual: { ports: { source: "north", target: "left" } } });
    expect(
      applyCommand(invalid, { kind: "reverseRelationship", id: "r" }).architecture.relationships[0]?.visual,
    ).toEqual({ ports: { source: "left", target: "north" } });

    const none = base({ visual: { custom: 1 } });
    expect(applyCommand(none, { kind: "reverseRelationship", id: "r" }).architecture.relationships[0]?.visual).toEqual({
      custom: 1,
    });
    expect(applyCommand(base(), { kind: "reverseRelationship", id: "r" }).architecture.relationships[0]).not.toHaveProperty(
      "visual",
    );
  });

  it("retype and setDirection keep visual", () => {
    const visual = { ports: { source: "top", target: "bottom" } };
    const arch = base({ visual });
    const retyped = applyCommand(arch, { kind: "retypeRelationship", id: "r", type: "uses" }).architecture;
    expect(retyped.relationships[0]?.visual).toEqual(visual);
    const undirected = applyCommand(arch, { kind: "setRelationshipDirection", id: "r", direction: "undirected" })
      .architecture;
    expect(undirected.relationships[0]?.visual).toEqual(visual);
  });
});
