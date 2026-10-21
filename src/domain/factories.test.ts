import { describe, expect, it, vi } from "vitest";
import { createArchitecture, createComponent, createGroup, createRelationship } from "./factories";

describe("domain factories", () => {
  it("creates typed IDs and matching timestamps for an architecture", () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");

    expect(createArchitecture("Example", "2026-10-21T12:00:00Z")).toEqual({
      id: "arch_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Example",
      createdAt: "2026-10-21T12:00:00Z",
      updatedAt: "2026-10-21T12:00:00Z",
      components: [],
      relationships: [],
      groups: [],
    });
  });

  it("creates components using type defaults and the first unused numeric suffix", () => {
    vi.spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValueOnce("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
      .mockReturnValueOnce("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
      .mockReturnValueOnce("cccccccc-cccc-4ccc-8ccc-cccccccccccc");

    expect(
      createComponent("agent", {
        position: { x: 4, y: 9 },
        existingNames: ["Agent", "Agent 2"],
      }),
    ).toEqual({
      id: "cmp_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      type: "agent",
      name: "Agent 3",
      position: { x: 4, y: 9 },
    });
    expect(
      createComponent("tool", {
        position: { x: 0, y: 0 },
        existingNames: [],
      }).name,
    ).toBe("Tool");
    expect(
      createComponent("agent", {
        subtype: "orchestrator",
        position: { x: 0, y: 0 },
        existingNames: ["Orchestrator"],
      }),
    ).toMatchObject({ id: "cmp_cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "Orchestrator 2", subtype: "orchestrator" });
  });

  it("does not allow non-agent factories to create an orchestrator", () => {
    expect(() =>
      createComponent("tool", {
        subtype: "orchestrator",
        position: { x: 0, y: 0 },
        existingNames: [],
      }),
    ).toThrowError(TypeError);
  });

  it("uses each relationship type's default direction", () => {
    vi.spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValueOnce("dddddddd-dddd-4ddd-8ddd-dddddddddddd")
      .mockReturnValueOnce("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");

    expect(createRelationship("generic", "a", "b")).toEqual({
      id: "rel_dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      type: "generic",
      sourceId: "a",
      targetId: "b",
      direction: "directed",
    });
    expect(createRelationship("shares_context_with", "a", "b").direction).toBe("undirected");
  });

  it("creates a group draft with empty bounds", () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("ffffffff-ffff-4fff-8fff-ffffffffffff");
    expect(createGroup("Group")).toEqual({
      id: "grp_ffffffff-ffff-4fff-8fff-ffffffffffff",
      name: "Group",
      memberComponentIds: [],
      bounds: { x: 0, y: 0, width: 0, height: 0 },
    });
  });
});
