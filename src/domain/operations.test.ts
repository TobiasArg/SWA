import { describe, expect, it } from "vitest";
import { DomainError, type Command } from "./commands";
import { computeGroupBounds } from "./geometry";
import { applyCommand } from "./operations";
import type { Architecture, Component, Group, Relationship } from "./types";

function component(
  id: string,
  type: Component["type"] = "agent",
  position = { x: 0, y: 0 },
  extra: Partial<Component> = {},
): Component {
  return { id, type, name: id, position, ...extra };
}

function relationship(
  id: string,
  sourceId: string,
  targetId: string,
  extra: Partial<Relationship> = {},
): Relationship {
  return {
    id,
    type: "generic",
    sourceId,
    targetId,
    direction: "directed",
    ...extra,
  };
}

function group(id: string, memberComponentIds: string[], members: Component[], bounds?: Group["bounds"]): Group {
  return {
    id,
    name: id,
    memberComponentIds,
    bounds: bounds ?? (members.length ? computeGroupBounds(members) : { x: 10, y: 20, width: 100, height: 80 }),
  };
}

function architecture(overrides: Partial<Architecture> = {}): Architecture {
  const components = [
    component("cmp_a", "agent", { x: 0, y: 0 }, { behavior: { purpose: "coordinate" } }),
    component("cmp_b", "tool", { x: 300, y: 100 }),
    component("cmp_c", "memory", { x: 600, y: 0 }),
  ];
  return {
    id: "arch_test",
    name: "Test",
    createdAt: "2026-10-21T00:00:00Z",
    updatedAt: "2026-10-21T00:00:00Z",
    components,
    relationships: [
      relationship("rel_ab", "cmp_a", "cmp_b", { type: "uses" }),
      relationship("rel_bc", "cmp_b", "cmp_c", { type: "reads_from" }),
      relationship("rel_ca", "cmp_c", "cmp_a"),
    ],
    groups: [group("grp_old", ["cmp_a", "cmp_b"], components.slice(0, 2))],
    ...overrides,
  };
}

function expectDomainError(input: Architecture, command: Command, code: string): void {
  try {
    applyCommand(input, command);
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code} to be thrown.`);
}

describe("applyCommand: component commands", () => {
  it("adds a valid component immutably and rejects duplicate IDs and invalid agent-only fields", () => {
    const input = architecture();
    const added = component("cmp_new", "decision", { x: 12, y: 18 });
    const result = applyCommand(input, { kind: "addComponent", component: added }).architecture;
    expect(result.components.at(-1)).toEqual(added);
    expect(input.components).toHaveLength(3);
    expect(result.components[0]).toBe(input.components[0]);

    expectDomainError(input, { kind: "addComponent", component: component("cmp_a") }, "E_DUPLICATE_ID");
    expectDomainError(
      input,
      {
        kind: "addComponent",
        component: { ...component("cmp_bad", "tool"), subtype: "orchestrator" },
      },
      "E_INVALID_SUBTYPE",
    );
    expectDomainError(
      input,
      {
        kind: "addComponent",
        component: { ...component("cmp_bad"), subtype: "unknown" } as unknown as Component,
      },
      "E_INVALID_SUBTYPE",
    );
    expectDomainError(
      input,
      {
        kind: "addComponent",
        component: { ...component("cmp_bad", "memory"), behavior: { purpose: "not allowed" } },
      },
      "E_BEHAVIOR_NOT_ALLOWED",
    );
    expectDomainError(input, { kind: "addComponent", component: component("cmp_bad", "agent", { x: Infinity, y: 0 }) }, "E_INVALID_POSITION");
    expectDomainError(
      input,
      { kind: "addComponent", component: { ...component("cmp_bad"), name: "  " } },
      "E_NAME_REQUIRED",
    );

    const normalized = applyCommand(input, {
      kind: "addComponent",
      component: {
        ...component("cmp_clean"),
        description: "",
        links: [],
        properties: { ignored: "" },
        behavior: { purpose: "", responsibilities: [] },
      },
    }).architecture.components.at(-1)!;
    expect(normalized).not.toHaveProperty("description");
    expect(normalized).not.toHaveProperty("links");
    expect(normalized).not.toHaveProperty("properties");
    expect(normalized).not.toHaveProperty("behavior");
  });

  it("duplicates components with all fields and offset but without relationships or membership", () => {
    const input = architecture();
    const result = applyCommand(input, {
      kind: "duplicateComponents",
      items: [{ sourceId: "cmp_a", newId: "cmp_copy" }],
    }).architecture;
    const copy = result.components[3]!;
    expect(copy).toMatchObject({
      id: "cmp_copy",
      name: "cmp_a (copy)",
      position: { x: 24, y: 24 },
      behavior: { purpose: "coordinate" },
    });
    expect(copy.behavior).not.toBe(input.components[0]?.behavior);
    expect(result.relationships).toBe(input.relationships);
    expect(result.groups[0]?.memberComponentIds).toEqual(["cmp_a", "cmp_b"]);
    expect(
      applyCommand(input, { kind: "duplicateComponents", items: [] }).architecture,
    ).toBe(input);

    expectDomainError(
      input,
      { kind: "duplicateComponents", items: [{ sourceId: "missing", newId: "cmp_copy" }] },
      "E_COMPONENT_NOT_FOUND",
    );
    expectDomainError(
      input,
      {
        kind: "duplicateComponents",
        items: [
          { sourceId: "cmp_a", newId: "cmp_copy" },
          { sourceId: "cmp_b", newId: "cmp_copy" },
        ],
      },
      "E_DUPLICATE_ID",
    );
  });

  it("moves components and groups without changing membership, updating member bounds", () => {
    const input = architecture();
    const result = applyCommand(input, {
      kind: "moveElements",
      componentPositions: { cmp_a: { x: -100, y: 500 } },
      groupDeltas: {},
    }).architecture;
    expect(result.components[0]?.position).toEqual({ x: -100, y: 500 });
    expect(result.groups[0]?.memberComponentIds).toEqual(["cmp_a", "cmp_b"]);
    expect(result.groups[0]?.bounds).toEqual(computeGroupBounds([result.components[0]!, result.components[1]! ]));
    expect(input.components[0]?.position).toEqual({ x: 0, y: 0 });

    const movedTogether = applyCommand(input, {
      kind: "moveElements",
      componentPositions: {
        cmp_a: { x: 8, y: 8 },
        cmp_b: { x: 308, y: 108 },
      },
      groupDeltas: { grp_old: { x: 8, y: 8 } },
    }).architecture;
    expect(movedTogether.groups[0]?.bounds).toEqual(computeGroupBounds(movedTogether.components.slice(0, 2)));

    const emptyGroup = group("grp_empty", [], []);
    const withEmpty = architecture({ groups: [input.groups[0]!, emptyGroup] });
    const emptyMoved = applyCommand(withEmpty, {
      kind: "moveElements",
      componentPositions: {},
      groupDeltas: { grp_empty: { x: 3, y: -4 } },
    }).architecture;
    expect(emptyMoved.groups[1]?.bounds).toEqual({ x: 13, y: 16, width: 100, height: 80 });

    expectDomainError(
      input,
      { kind: "moveElements", componentPositions: { missing: { x: 0, y: 0 } }, groupDeltas: {} },
      "E_COMPONENT_NOT_FOUND",
    );
    expectDomainError(
      input,
      { kind: "moveElements", componentPositions: { cmp_a: { x: NaN, y: 0 } }, groupDeltas: {} },
      "E_INVALID_POSITION",
    );
    expectDomainError(
      input,
      { kind: "moveElements", componentPositions: {}, groupDeltas: { missing: { x: 0, y: 0 } } },
      "E_GROUP_NOT_FOUND",
    );
    expect(
      applyCommand(input, { kind: "moveElements", componentPositions: {}, groupDeltas: {} }).architecture,
    ).toBe(input);
  });

  it("resizes with min/max clamping and updates containing group bounds", () => {
    const input = architecture();
    const result = applyCommand(input, {
      kind: "resizeComponent",
      id: "cmp_a",
      position: { x: -20, y: 50 },
      size: { width: 900, height: 20 },
    }).architecture;
    expect(result.components[0]).toMatchObject({
      position: { x: -20, y: 50 },
      size: { width: 480, height: 56 },
    });
    expect(result.groups[0]?.bounds).toEqual(computeGroupBounds([result.components[0]!, result.components[1]! ]));
    expectDomainError(
      input,
      { kind: "resizeComponent", id: "cmp_a", position: { x: 0, y: 0 }, size: { width: -1, height: 20 } },
      "E_INVALID_SIZE",
    );
  });

  it("updates component fields, removes empty optionals, checks names, and manages properties", () => {
    const input = architecture({
      components: [
        component("cmp_a", "memory", { x: 0, y: 0 }, {
          description: "Old",
          notes: "Notes",
          links: [{ label: "Docs", url: "https://example.com" }],
          properties: { keep: "value", storeKind: "vector" },
        }),
        ...architecture().components.slice(1),
      ],
    });
    const updated = applyCommand(input, {
      kind: "updateComponent",
      id: "cmp_a",
      patch: { name: "Memory", description: "", notes: undefined, links: [] },
    }).architecture.components[0]!;
    expect(updated.name).toBe("Memory");
    expect(updated.description).toBeUndefined();
    expect(updated.notes).toBeUndefined();
    expect(updated.links).toBeUndefined();
    const addedDocumentation = applyCommand(input, {
      kind: "updateComponent",
      id: "cmp_a",
      patch: {
        description: "Updated description",
        notes: "Updated notes",
        links: [{ label: "Reference", url: "https://example.com" }],
      },
    }).architecture.components[0]!;
    expect(addedDocumentation).toMatchObject({
      description: "Updated description",
      notes: "Updated notes",
      links: [{ label: "Reference", url: "https://example.com" }],
    });
    expectDomainError(input, { kind: "updateComponent", id: "cmp_a", patch: { name: "  " } }, "E_NAME_REQUIRED");

    const propertySet = applyCommand(input, {
      kind: "setComponentProperty",
      id: "cmp_a",
      key: "accessScope",
      value: "shared",
    }).architecture.components[0]!;
    expect(propertySet.properties).toEqual({ keep: "value", storeKind: "vector", accessScope: "shared" });
    const propertyRemoved = applyCommand(
      { ...input, components: [propertySet, ...input.components.slice(1)] },
      { kind: "setComponentProperty", id: "cmp_a", key: "storeKind", value: "" },
    ).architecture.components[0]!;
    expect(propertyRemoved.properties).toEqual({ keep: "value", accessScope: "shared" });
    const onlyProperty = component("cmp_only", "tool", { x: 0, y: 0 }, { properties: { custom: "value" } });
    const withoutProperties = applyCommand(
      { ...input, components: [onlyProperty, ...input.components.slice(1)] },
      { kind: "setComponentProperty", id: "cmp_only", key: "custom", value: undefined },
    ).architecture.components[0]!;
    expect(withoutProperties).not.toHaveProperty("properties");
    expectDomainError(
      input,
      { kind: "setComponentProperty", id: "cmp_a", key: "storeKind", value: "invalid" },
      "E_INVALID_PROPERTY_VALUE",
    );
    expectDomainError(
      input,
      { kind: "setComponentProperty", id: "cmp_a", key: "accessScope", value: "global" },
      "E_INVALID_PROPERTY_VALUE",
    );
  });

  it("updates behavior only for agents and toggles subtype without discarding data", () => {
    const input = architecture();
    const behavioral = applyCommand(input, {
      kind: "updateBehavior",
      id: "cmp_a",
      patch: { purpose: "", role: "coordinator", responsibilities: ["delegate"] },
    }).architecture.components[0]!;
    expect(behavioral.behavior).toEqual({ role: "coordinator", responsibilities: ["delegate"] });
    const cleared = applyCommand(
      { ...input, components: [behavioral, ...input.components.slice(1)] },
      { kind: "updateBehavior", id: "cmp_a", patch: { role: undefined, responsibilities: [] } },
    ).architecture.components[0]!;
    expect(cleared.behavior).toBeUndefined();
    expectDomainError(
      input,
      { kind: "updateBehavior", id: "cmp_b", patch: { purpose: "bad" } },
      "E_BEHAVIOR_NOT_ALLOWED",
    );

    const subtype = applyCommand(input, { kind: "setSubtype", id: "cmp_a", subtype: "orchestrator" }).architecture;
    expect(subtype.components[0]?.subtype).toBe("orchestrator");
    expect(subtype.components[0]?.behavior).toEqual(input.components[0]?.behavior);
    expect(applyCommand(subtype, { kind: "setSubtype", id: "cmp_a", subtype: undefined }).architecture.components[0]?.subtype).toBeUndefined();
    expectDomainError(input, { kind: "setSubtype", id: "cmp_b", subtype: "orchestrator" }, "E_INVALID_SUBTYPE");
    expectDomainError(
      input,
      { kind: "setSubtype", id: "cmp_a", subtype: "unknown" } as unknown as Command,
      "E_INVALID_SUBTYPE",
    );
  });
});

describe("applyCommand: relationship commands", () => {
  it("validates endpoints, self links, IDs, and fixed direction on creation", () => {
    const input = architecture();
    const added = relationship("rel_new", "cmp_a", "cmp_c", {
      type: "shares_context_with",
      direction: "undirected",
    });
    expect(applyCommand(input, { kind: "addRelationship", relationship: added }).architecture.relationships.at(-1)).toEqual(added);
    expectDomainError(input, { kind: "addRelationship", relationship: relationship("rel_new", "cmp_a", "missing") }, "E_ENDPOINT_NOT_FOUND");
    expectDomainError(input, { kind: "addRelationship", relationship: relationship("rel_new", "missing", "cmp_a") }, "E_ENDPOINT_NOT_FOUND");
    expectDomainError(input, { kind: "addRelationship", relationship: relationship("rel_new", "cmp_a", "cmp_a") }, "E_SELF_RELATIONSHIP");
    expectDomainError(
      input,
      { kind: "addRelationship", relationship: relationship("rel_new", "cmp_a", "cmp_c", { type: "shares_context_with" }) },
      "E_INVALID_DIRECTION",
    );
    expectDomainError(
      input,
      {
        kind: "addRelationship",
        relationship: relationship("rel_new", "grp_old", "cmp_c"),
      },
      "E_GROUP_ENDPOINT",
    );
    expectDomainError(
      input,
      {
        kind: "addRelationship",
        relationship: relationship("rel_new", "cmp_a", "grp_old"),
      },
      "E_GROUP_ENDPOINT",
    );
    expectDomainError(
      input,
      { kind: "addRelationship", relationship: relationship("rel_ab", "cmp_a", "cmp_c") },
      "E_DUPLICATE_ID",
    );
  });

  it("updates optional text and enforces generic-only direction/reverse actions", () => {
    const input = architecture();
    const changed = applyCommand(input, {
      kind: "updateRelationship",
      id: "rel_ab",
      patch: { label: "tool access", description: "" },
    }).architecture.relationships[0]!;
    expect(changed.label).toBe("tool access");
    expect(changed.description).toBeUndefined();
    const cleared = applyCommand(
      { ...input, relationships: [changed, ...input.relationships.slice(1)] },
      { kind: "updateRelationship", id: "rel_ab", patch: { label: "" } },
    ).architecture.relationships[0]!;
    expect(cleared.label).toBeUndefined();

    expectDomainError(input, { kind: "setRelationshipDirection", id: "rel_ab", direction: "undirected" }, "E_DIRECTION_FIXED");
    const undirected = applyCommand(input, { kind: "setRelationshipDirection", id: "rel_ca", direction: "undirected" }).architecture;
    expect(undirected.relationships[2]?.direction).toBe("undirected");
    expectDomainError(undirected, { kind: "reverseRelationship", id: "rel_ca" }, "E_REVERSE_NOT_ALLOWED");
    expectDomainError(
      input,
      { kind: "setRelationshipDirection", id: "rel_ca", direction: "sideways" } as unknown as Command,
      "E_INVALID_DIRECTION",
    );
    const reversed = applyCommand(input, { kind: "reverseRelationship", id: "rel_ca" }).architecture.relationships[2]!;
    expect(reversed).toMatchObject({ sourceId: "cmp_a", targetId: "cmp_c" });
    expectDomainError(input, { kind: "reverseRelationship", id: "rel_ab" }, "E_REVERSE_NOT_ALLOWED");
  });

  it("retypes relationships with the new fixed direction or preserves direction for Generic", () => {
    const undirected = applyCommand(architecture(), {
      kind: "setRelationshipDirection",
      id: "rel_ca",
      direction: "undirected",
    }).architecture;
    const asGeneric = applyCommand(undirected, {
      kind: "retypeRelationship",
      id: "rel_ca",
      type: "generic",
    }).architecture.relationships[2]!;
    expect(asGeneric.direction).toBe("undirected");

    const asPredefined = applyCommand(undirected, {
      kind: "retypeRelationship",
      id: "rel_ca",
      type: "depends_on",
    }).architecture.relationships[2]!;
    expect(asPredefined).toMatchObject({ type: "depends_on", direction: "directed" });
    expectDomainError(architecture(), { kind: "retypeRelationship", id: "missing", type: "uses" }, "E_RELATIONSHIP_NOT_FOUND");
    expectDomainError(
      architecture(),
      { kind: "retypeRelationship", id: "rel_ca", type: "unsupported" } as unknown as Command,
      "E_INVALID_RELATIONSHIP_TYPE",
    );
  });
});

describe("applyCommand: group commands and deletion", () => {
  it("creates a group, reassigns members from old groups, and computes enclosing bounds", () => {
    const input = architecture();
    const result = applyCommand(input, {
      kind: "createGroup",
      group: { id: "grp_new", name: "New group" },
      memberIds: ["cmp_a", "cmp_c"],
    }).architecture;
    expect(result.groups[0]?.memberComponentIds).toEqual(["cmp_b"]);
    expect(result.groups[1]?.memberComponentIds).toEqual(["cmp_a", "cmp_c"]);
    expect(result.groups[1]?.bounds).toEqual(computeGroupBounds([result.components[0]!, result.components[2]! ]));
    expectDomainError(input, { kind: "createGroup", group: { id: "grp_empty", name: "Empty" }, memberIds: [] }, "E_EMPTY_GROUP");
    expectDomainError(
      input,
      { kind: "createGroup", group: { id: "grp_new", name: "New" }, memberIds: ["cmp_a", "cmp_a"] },
      "E_DUPLICATE_GROUP_MEMBER",
    );
    expectDomainError(
      input,
      { kind: "createGroup", group: { id: "grp_new", name: "New" }, memberIds: ["missing"] },
      "E_COMPONENT_NOT_FOUND",
    );
    expectDomainError(
      input,
      { kind: "createGroup", group: { id: "grp_new", name: "New" }, memberIds: ["grp_old"] },
      "E_GROUP_AS_MEMBER",
    );
    expectDomainError(
      input,
      { kind: "createGroup", group: { id: "grp_old", name: "New" }, memberIds: ["cmp_c"] },
      "E_DUPLICATE_ID",
    );
    expectDomainError(
      input,
      { kind: "createGroup", group: { id: "grp_new", name: " " }, memberIds: ["cmp_c"] },
      "E_NAME_REQUIRED",
    );
  });

  it("updates group names and optional descriptions/notes", () => {
    const input = architecture();
    const updated = applyCommand(input, {
      kind: "updateGroup",
      id: "grp_old",
      patch: { name: "Renamed", description: "Description", notes: "Notes" },
    }).architecture;
    expect(updated.groups[0]).toMatchObject({ name: "Renamed", description: "Description", notes: "Notes" });
    const cleared = applyCommand(updated, {
      kind: "updateGroup",
      id: "grp_old",
      patch: { description: "", notes: undefined },
    }).architecture.groups[0]!;
    expect(cleared.description).toBeUndefined();
    expect(cleared.notes).toBeUndefined();
    expectDomainError(input, { kind: "updateGroup", id: "grp_old", patch: { name: "" } }, "E_NAME_REQUIRED");
  });

  it("assigns, removes, and reassigns components with no duplicate membership", () => {
    const input = architecture({
      groups: [
        ...architecture().groups,
        group("grp_target", ["cmp_c"], [architecture().components[2]!]),
      ],
    });
    const reassigned = applyCommand(input, {
      kind: "assignToGroup",
      componentIds: ["cmp_a", "cmp_c"],
      groupId: "grp_target",
    }).architecture;
    expect(reassigned.groups[0]?.memberComponentIds).toEqual(["cmp_b"]);
    expect(reassigned.groups[1]?.memberComponentIds).toEqual(["cmp_c", "cmp_a"]);
    expect(reassigned.groups[1]?.bounds).toEqual(computeGroupBounds([reassigned.components[2]!, reassigned.components[0]! ]));

    const ungrouped = applyCommand(reassigned, {
      kind: "assignToGroup",
      componentIds: ["cmp_a"],
      groupId: null,
    }).architecture;
    expect(ungrouped.groups[1]?.memberComponentIds).toEqual(["cmp_c"]);
    expectDomainError(
      input,
      { kind: "assignToGroup", componentIds: ["cmp_a"], groupId: "missing" },
      "E_GROUP_NOT_FOUND",
    );
    expect(
      applyCommand(input, { kind: "assignToGroup", componentIds: [], groupId: null }).architecture,
    ).toBe(input);
  });

  it("deletes components with relationship cascades, prunes membership, and reports actual counts", () => {
    const input = architecture();
    const result = applyCommand(input, {
      kind: "deleteElements",
      componentIds: ["cmp_a", "missing"],
      relationshipIds: ["rel_bc"],
      groupIds: [],
    });
    expect(result.summary).toEqual({ deletedComponents: 1, deletedRelationships: 3, deletedGroups: 0 });
    expect(result.architecture.components.map((component) => component.id)).toEqual(["cmp_b", "cmp_c"]);
    expect(result.architecture.relationships).toEqual([]);
    expect(result.architecture.groups[0]?.memberComponentIds).toEqual(["cmp_b"]);
    expect(result.architecture.groups[0]?.bounds).toEqual(computeGroupBounds([result.architecture.components[0]!]));
    expect(input.components).toHaveLength(3);

    expect(
      applyCommand(input, { kind: "deleteElements", componentIds: ["unknown"], relationshipIds: [], groupIds: ["unknown"] })
        .summary,
    ).toEqual({ deletedComponents: 0, deletedRelationships: 0, deletedGroups: 0 });

    const emptyGroup = group("grp_empty", [], [], { x: 1, y: 2, width: 3, height: 4 });
    const emptyGroupArchitecture = architecture({ groups: [emptyGroup] });
    const groupAfterDelete = applyCommand(emptyGroupArchitecture, {
      kind: "deleteElements",
      componentIds: ["cmp_a"],
      relationshipIds: [],
      groupIds: [],
    }).architecture.groups[0]!;
    expect(groupAfterDelete.bounds).toEqual(emptyGroup.bounds);
  });

  it("deletes selected groups while keeping members and their relationships", () => {
    const input = architecture();
    const result = applyCommand(input, {
      kind: "deleteElements",
      componentIds: [],
      relationshipIds: [],
      groupIds: ["grp_old"],
    });
    expect(result.summary).toEqual({ deletedComponents: 0, deletedRelationships: 0, deletedGroups: 1 });
    expect(result.architecture.components).toBe(input.components);
    expect(result.architecture.relationships).toBe(input.relationships);
    expect(result.architecture.groups).toEqual([]);
  });
});
