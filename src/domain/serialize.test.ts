import { describe, expect, it } from "vitest";
import { toArchitectureFile } from "./serialize";
import type { Architecture } from "./types";

describe("toArchitectureFile", () => {
  it("emits a fresh canonical object with fixed key order and preserves array order", () => {
    const input: Architecture = {
      id: "arch_test",
      name: "Test",
      description: "Description",
      createdAt: "2026-10-21T00:00:00Z",
      updatedAt: "2026-10-21T00:00:00Z",
      components: [
        {
          id: "cmp_b",
          type: "agent",
          subtype: "orchestrator",
          name: "B",
          notes: "Notes",
          links: [{ url: "https://example.com", label: "Docs" }],
          position: { x: 2, y: 3 },
          size: { width: 220, height: 88 },
          properties: { arbitrary: "kept" },
          behavior: {
            outputs: "out",
            purpose: "why",
            rules: ["rule"],
          },
        },
        { id: "cmp_a", type: "tool", name: "A", position: { x: 0, y: 0 } },
      ],
      relationships: [
        {
          id: "rel_1",
          type: "generic",
          sourceId: "cmp_b",
          targetId: "cmp_a",
          direction: "directed",
          visual: { custom: { x: 1 } },
        },
      ],
      groups: [],
      canvas: { viewport: { x: 1, y: 2, zoom: 1.5 } },
    };

    const file = toArchitectureFile(input);
    expect(file).not.toBe(input);
    expect(Object.keys(file)).toEqual(["schemaVersion", "architecture"]);
    expect(Object.keys(file.architecture)).toEqual([
      "id",
      "name",
      "description",
      "createdAt",
      "updatedAt",
      "components",
      "relationships",
      "groups",
      "canvas",
    ]);
    expect(Object.keys(file.architecture.components[0]!)).toEqual([
      "id",
      "type",
      "subtype",
      "name",
      "notes",
      "links",
      "position",
      "size",
      "properties",
      "behavior",
    ]);
    expect(Object.keys(file.architecture.components[0]!.behavior!)).toEqual(["purpose", "rules", "outputs"]);
    expect(file.architecture.components.map((component) => component.id)).toEqual(["cmp_b", "cmp_a"]);
    expect(Object.keys(file.architecture.components[0]!.links![0]!)).toEqual(["label", "url"]);
    expect(Object.keys(file.architecture.relationships[0]!)).toEqual([
      "id",
      "type",
      "sourceId",
      "targetId",
      "direction",
      "visual",
    ]);
    expect(file.architecture.relationships[0]?.visual).toEqual({ custom: { x: 1 } });
    expect(JSON.stringify(toArchitectureFile(input))).toBe(JSON.stringify(file));
  });

  it("omits normalized empty optional fields", () => {
    const input: Architecture = {
      id: "arch_test",
      name: "Test",
      description: "",
      createdAt: "2026-10-21T00:00:00Z",
      updatedAt: "2026-10-21T00:00:00Z",
      components: [{ id: "cmp_1", type: "tool", name: "Tool", position: { x: 0, y: 0 }, description: "" }],
      relationships: [],
      groups: [],
    };
    expect(Object.keys(toArchitectureFile(input).architecture)).not.toContain("description");
    expect(Object.keys(toArchitectureFile(input).architecture.components[0]!)).not.toContain("description");
  });
});
