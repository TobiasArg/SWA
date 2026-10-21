import { describe, expect, it } from "vitest";
import { normalizeArchitecture } from "./normalize";
import type { Architecture } from "./types";

function sampleArchitecture(): Architecture {
  return {
    id: "arch_test",
    name: "Test",
    description: "",
    createdAt: "2026-10-21T00:00:00Z",
    updatedAt: "2026-10-21T00:00:00Z",
    components: [
      {
        id: "cmp_agent",
        type: "agent",
        name: "Agent",
        description: "",
        notes: "",
        links: [{ label: "", url: "https://example.com" }],
        position: { x: 10, y: 20 },
        size: { width: 900, height: 20 },
        properties: { empty: "", keep: "value" },
        behavior: { purpose: "", role: "worker", responsibilities: [], rules: ["rule"] },
      },
    ],
    relationships: [
      {
        id: "rel_test",
        type: "generic",
        sourceId: "cmp_agent",
        targetId: "cmp_other",
        direction: "directed",
        label: "",
        description: "",
        visual: { points: [1, 2] },
      },
    ],
    groups: [
      {
        id: "grp_team",
        name: "Team",
        description: "",
        notes: "",
        memberComponentIds: ["cmp_agent"],
        bounds: { x: 900, y: 900, width: 10, height: 10 },
      },
      {
        id: "grp_empty",
        name: "Empty",
        memberComponentIds: [],
        bounds: { x: 5, y: 6, width: 7, height: 8 },
      },
    ],
    canvas: {},
  };
}

describe("normalizeArchitecture", () => {
  it("removes empty optional values, clamps sizes, and recomputes non-empty group bounds", () => {
    const input = sampleArchitecture();
    const normalized = normalizeArchitecture(input);

    expect(normalized).not.toBe(input);
    expect(normalized.description).toBeUndefined();
    expect(normalized.canvas).toBeUndefined();
    expect(normalized.components[0]).toEqual({
      id: "cmp_agent",
      type: "agent",
      name: "Agent",
      position: { x: 10, y: 20 },
      size: { width: 480, height: 56 },
      links: [{ url: "https://example.com" }],
      properties: { keep: "value" },
      behavior: { role: "worker", rules: ["rule"] },
    });
    expect(normalized.relationships[0]).toEqual({
      id: "rel_test",
      type: "generic",
      sourceId: "cmp_agent",
      targetId: "cmp_other",
      direction: "directed",
      visual: { points: [1, 2] },
    });
    expect(normalized.groups[0]?.bounds).toEqual({ x: -14, y: -36, width: 528, height: 136 });
    expect(normalized.groups[1]?.bounds).toEqual({ x: 5, y: 6, width: 7, height: 8 });
    expect(input.components[0]?.size).toEqual({ width: 900, height: 20 });
    expect(input.groups[0]?.bounds).toEqual({ x: 900, y: 900, width: 10, height: 10 });
  });

  it("omits optional empty arrays, records, and fully empty behavior objects", () => {
    const input: Architecture = {
      id: "arch_empty",
      name: "Empty",
      createdAt: "2026-10-21T00:00:00Z",
      updatedAt: "2026-10-21T00:00:00Z",
      components: [
        {
          id: "cmp_agent",
          type: "agent",
          name: "Agent",
          position: { x: 0, y: 0 },
          links: [],
          properties: {},
          behavior: { purpose: "", responsibilities: [], boundaries: [], rules: [] },
        },
      ],
      relationships: [],
      groups: [],
    };

    expect(normalizeArchitecture(input).components[0]).toEqual({
      id: "cmp_agent",
      type: "agent",
      name: "Agent",
      position: { x: 0, y: 0 },
    });
  });
});
