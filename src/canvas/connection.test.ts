import { describe, expect, it } from "vitest";
import {
  RELATIONSHIP_TYPE_ORDER,
  addRelationshipAndSelect,
  directionNote,
  eventClientPoint,
  readsAsHint,
  resolveConnectionTarget,
} from "./connection";
import { createFakeStore } from "./testing/fakeStore";
import { buildFixtureArchitecture } from "./testing/fixtures";

function nodeElement(id: string, kind: "component" | "group-container") {
  const node = document.createElement("div");
  node.className = `react-flow__node react-flow__node-${kind}`;
  node.setAttribute("data-id", id);
  const inner = document.createElement("span");
  node.appendChild(inner);
  return { node, inner };
}

describe("relationship type texts", () => {
  it("lists the 10 types in canonical order", () => {
    expect(RELATIONSHIP_TYPE_ORDER).toEqual([
      "delegates_to",
      "supervises",
      "uses",
      "reads_from",
      "writes_to",
      "shares_context_with",
      "reports_to",
      "hands_off_to",
      "depends_on",
      "generic",
    ]);
  });

  it("reads each type as a sentence about source and target", () => {
    expect(readsAsHint("reads_from")).toBe("Source reads from target");
    expect(readsAsHint("shares_context_with")).toBe("Source and target share context");
    expect(readsAsHint("generic")).toBe("Source relates to target");
  });

  it("states the direction rule", () => {
    expect(directionNote("uses")).toMatch(/^Directed \(fixed by type\)/);
    expect(directionNote("shares_context_with")).toMatch(/^Undirected \(fixed by type\)/);
    expect(directionNote("generic")).toMatch(/^Directed by default/);
  });
});

describe("addRelationshipAndSelect", () => {
  it("dispatches ONE addRelationship with the default direction and selects it", () => {
    const store = createFakeStore(buildFixtureArchitecture());
    const id = addRelationshipAndSelect(store, "shares_context_with", "cmp_crm", "cmp_search");
    expect(store.commands).toHaveLength(1);
    expect(store.commands[0]).toEqual({
      kind: "addRelationship",
      relationship: { id, type: "shares_context_with", sourceId: "cmp_crm", targetId: "cmp_search", direction: "undirected" },
    });
    expect(store.getState().selection).toEqual({ componentIds: [], relationshipIds: [id], groupIds: [] });

    const directed = addRelationshipAndSelect(store, "hands_off_to", "cmp_crm", "cmp_search");
    expect(store.getState().architecture.relationships.find((r) => r.id === directed)!.direction).toBe("directed");
  });

  it("returns null and keeps the selection when the domain rejects it", () => {
    const store = createFakeStore(buildFixtureArchitecture());
    expect(addRelationshipAndSelect(store, "uses", "cmp_crm", "grp_empty")).toBeNull();
    expect(store.selections).toEqual([]);
  });
});

describe("resolveConnectionTarget", () => {
  const components = new Set(["cmp_a", "cmp_b"]);

  it("accepts another component (also from an element inside it)", () => {
    const { inner } = nodeElement("cmp_b", "component");
    expect(resolveConnectionTarget(inner, "cmp_a", components)).toEqual({ status: "valid", targetId: "cmp_b" });
  });

  it("rejects the source itself, groups, the pane and nothing", () => {
    expect(resolveConnectionTarget(nodeElement("cmp_a", "component").node, "cmp_a", components).status).toBe("invalid");
    expect(resolveConnectionTarget(nodeElement("grp_x", "group-container").inner, "cmp_a", components).status).toBe(
      "invalid",
    );
    const pane = document.createElement("div");
    pane.className = "react-flow__pane";
    expect(resolveConnectionTarget(pane, "cmp_a", components)).toEqual({ status: "invalid", targetId: null });
    expect(resolveConnectionTarget(null, "cmp_a", components).status).toBe("invalid");
  });
});

describe("eventClientPoint", () => {
  it("reads mouse events", () => {
    expect(eventClientPoint(new MouseEvent("mouseup", { clientX: 5, clientY: 7 }))).toEqual({ x: 5, y: 7 });
  });
});
