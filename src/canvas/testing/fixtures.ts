/**
 * TEST-ONLY fixture builder for canvas tests and spikes. Do not import from
 * production code.
 */
import { computeGroupBounds } from "../../domain/geometry";
import type { Architecture, Component, Group, Relationship } from "../../domain/types";

export function makeComponent(overrides: Partial<Component> & Pick<Component, "id" | "type">): Component {
  return {
    name: overrides.id,
    position: { x: 0, y: 0 },
    ...overrides,
  };
}

export function makeRelationship(
  overrides: Partial<Relationship> & Pick<Relationship, "id" | "sourceId" | "targetId">,
): Relationship {
  return {
    type: "uses",
    direction: "directed",
    ...overrides,
  };
}

export function makeGroup(id: string, name: string, members: Component[]): Group {
  return {
    id,
    name,
    memberComponentIds: members.map((member) => member.id),
    bounds: computeGroupBounds(members),
  };
}

export function emptyArchitecture(overrides: Partial<Architecture> = {}): Architecture {
  return {
    id: "arch_test",
    name: "Test architecture",
    createdAt: "2026-10-21T00:00:00.000Z",
    updatedAt: "2026-10-21T00:00:00.000Z",
    components: [],
    relationships: [],
    groups: [],
    ...overrides,
  };
}

/**
 * An architecture with two groups (one with members, one empty), every component
 * type including an orchestrator, and directed, undirected, generic and parallel
 * relationships with and without labels.
 */
export function buildFixtureArchitecture(overrides: Partial<Architecture> = {}): Architecture {
  const orchestrator = makeComponent({
    id: "cmp_orch",
    type: "agent",
    subtype: "orchestrator",
    name: "Lead Orchestrator",
    description: "Routes incoming work to the specialist agents.",
    position: { x: 80, y: 80 },
  });
  const discovery = makeComponent({
    id: "cmp_discovery",
    type: "agent",
    name: "Discovery Agent",
    description: "Finds new leads.",
    position: { x: 420, y: 300 },
  });
  const validation = makeComponent({
    id: "cmp_validation",
    type: "agent",
    name: "Validation Agent",
    position: { x: 720, y: 300 },
  });
  const search = makeComponent({
    id: "cmp_search",
    type: "tool",
    name: "Web Search",
    position: { x: 80, y: 520 },
  });
  const store = makeComponent({
    id: "cmp_store",
    type: "memory",
    name: "Shared Lead Store",
    position: { x: 720, y: 560 },
  });
  const crm = makeComponent({
    id: "cmp_crm",
    type: "external_system",
    name: "CRM",
    position: { x: 1060, y: 80 },
  });
  const router = makeComponent({
    id: "cmp_router",
    type: "decision",
    name: "Lead Router",
    position: { x: 420, y: 80 },
    size: { width: 240, height: 96 },
  });

  const components = [orchestrator, discovery, validation, search, store, crm, router];

  const relationships: Relationship[] = [
    makeRelationship({ id: "rel_delegate", type: "delegates_to", sourceId: "cmp_orch", targetId: "cmp_router" }),
    makeRelationship({
      id: "rel_reads",
      type: "reads_from",
      sourceId: "cmp_validation",
      targetId: "cmp_store",
      label: "lead records",
    }),
    makeRelationship({
      id: "rel_shares",
      type: "shares_context_with",
      direction: "undirected",
      sourceId: "cmp_discovery",
      targetId: "cmp_validation",
    }),
    makeRelationship({
      id: "rel_generic",
      type: "generic",
      sourceId: "cmp_router",
      targetId: "cmp_crm",
      label: "syncs routing decisions with the customer relationship manager",
    }),
    makeRelationship({ id: "rel_uses_1", type: "uses", sourceId: "cmp_discovery", targetId: "cmp_search" }),
    // Parallel to rel_uses_1, stored in the opposite order.
    makeRelationship({
      id: "rel_uses_2",
      type: "generic",
      direction: "undirected",
      sourceId: "cmp_search",
      targetId: "cmp_discovery",
    }),
  ];

  const groups: Group[] = [
    makeGroup("grp_research", "Research Team", [discovery, validation]),
    {
      id: "grp_empty",
      name: "Later",
      memberComponentIds: [],
      bounds: { x: 1040, y: 360, width: 260, height: 160 },
    },
  ];

  return emptyArchitecture({ components, relationships, groups, ...overrides });
}
