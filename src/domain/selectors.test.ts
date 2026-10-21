import { describe, expect, it } from "vitest";
import { describeRelationship, getComponent, getGroupOfComponent, getRelationshipsOf, relationshipDisplayLabel } from "./selectors";
import type { Architecture, Relationship } from "./types";

function relationship(overrides: Partial<Relationship> & Pick<Relationship, "id" | "sourceId" | "targetId">): Relationship {
  return {
    type: "generic",
    direction: "directed",
    ...overrides,
  };
}

const architecture: Architecture = {
  id: "arch_test",
  name: "Test",
  createdAt: "2026-10-21T00:00:00Z",
  updatedAt: "2026-10-21T00:00:00Z",
  components: [
    { id: "cmp_b", type: "agent", name: "Beta", position: { x: 0, y: 0 } },
    { id: "cmp_a", type: "agent", name: "Alpha", position: { x: 0, y: 0 } },
  ],
  relationships: [
    relationship({ id: "rel_out", sourceId: "cmp_a", targetId: "cmp_b", type: "uses" }),
    relationship({ id: "rel_in", sourceId: "cmp_b", targetId: "cmp_a", type: "reports_to" }),
    relationship({
      id: "rel_undirected",
      sourceId: "cmp_b",
      targetId: "cmp_a",
      type: "shares_context_with",
      direction: "undirected",
    }),
    relationship({
      id: "rel_generic_undirected",
      sourceId: "cmp_b",
      targetId: "cmp_a",
      direction: "undirected",
      label: "collaborates",
    }),
  ],
  groups: [{ id: "grp_team", name: "Team", memberComponentIds: ["cmp_a"], bounds: { x: 0, y: 0, width: 1, height: 1 } }],
};

describe("domain selectors", () => {
  it("finds components and their group", () => {
    expect(getComponent(architecture, "cmp_a")?.name).toBe("Alpha");
    expect(getComponent(architecture, "missing")).toBeUndefined();
    expect(getGroupOfComponent(architecture, "cmp_a")?.id).toBe("grp_team");
    expect(getGroupOfComponent(architecture, "cmp_b")).toBeUndefined();
  });

  it("splits directed incoming/outgoing relations and returns undirected ones once", () => {
    expect(getRelationshipsOf(architecture, "cmp_a")).toEqual({
      outgoing: [architecture.relationships[0]],
      incoming: [architecture.relationships[1]],
      undirected: [architecture.relationships[2], architecture.relationships[3]],
    });
    expect(getRelationshipsOf(architecture, "cmp_b").undirected).toHaveLength(2);
  });

  it("chooses the canonical display labels", () => {
    expect(relationshipDisplayLabel(architecture.relationships[0]!)).toBe("uses");
    expect(relationshipDisplayLabel({ ...architecture.relationships[0]!, label: "tooling" })).toBe("uses · tooling");
    expect(relationshipDisplayLabel(architecture.relationships[3]!)).toBe("collaborates");
    expect(relationshipDisplayLabel({ ...architecture.relationships[3]!, label: undefined })).toBe("relates to");
  });

  it("describes directed semantics and keeps undirected descriptions independent of stored endpoint order", () => {
    expect(describeRelationship(architecture, architecture.relationships[0]!)).toBe("Alpha uses Beta.");
    expect(describeRelationship(architecture, architecture.relationships[2]!)).toBe("Alpha and Beta share context.");
    const firstOrder = architecture.relationships[3]!;
    const reversedOrder = { ...firstOrder, sourceId: firstOrder.targetId, targetId: firstOrder.sourceId };
    expect(describeRelationship(architecture, firstOrder)).toBe("Alpha and Beta are related by collaborates.");
    expect(describeRelationship(architecture, reversedOrder)).toBe(describeRelationship(architecture, firstOrder));
  });
});
