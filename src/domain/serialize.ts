import { normalizeArchitecture } from "./normalize";
import { SCHEMA_VERSION } from "./types";
import type { AgentBehavior, Architecture, ArchitectureFile, Component, Group, Relationship } from "./types";

function serializeBehavior(behavior: AgentBehavior): AgentBehavior {
  return {
    ...(behavior.purpose === undefined ? {} : { purpose: behavior.purpose }),
    ...(behavior.role === undefined ? {} : { role: behavior.role }),
    ...(behavior.responsibilities === undefined ? {} : { responsibilities: [...behavior.responsibilities] }),
    ...(behavior.boundaries === undefined ? {} : { boundaries: [...behavior.boundaries] }),
    ...(behavior.activation === undefined ? {} : { activation: behavior.activation }),
    ...(behavior.rules === undefined ? {} : { rules: [...behavior.rules] }),
    ...(behavior.delegation === undefined ? {} : { delegation: behavior.delegation }),
    ...(behavior.outputs === undefined ? {} : { outputs: behavior.outputs }),
    ...(behavior.failureHandling === undefined ? {} : { failureHandling: behavior.failureHandling }),
  };
}

function serializeComponent(component: Component): Component {
  return {
    id: component.id,
    type: component.type,
    ...(component.subtype === undefined ? {} : { subtype: component.subtype }),
    name: component.name,
    ...(component.description === undefined ? {} : { description: component.description }),
    ...(component.notes === undefined ? {} : { notes: component.notes }),
    ...(component.links === undefined
      ? {}
      : {
          links: component.links.map((link) => ({
            ...(link.label === undefined ? {} : { label: link.label }),
            url: link.url,
          })),
        }),
    position: { x: component.position.x, y: component.position.y },
    ...(component.size === undefined
      ? {}
      : { size: { width: component.size.width, height: component.size.height } }),
    ...(component.accent === undefined ? {} : { accent: component.accent }),
    ...(component.properties === undefined
      ? {}
      : {
          properties: Object.fromEntries(
            Object.entries(component.properties).sort(([left], [right]) =>
              left < right ? -1 : left > right ? 1 : 0,
            ),
          ),
        }),
    ...(component.behavior === undefined ? {} : { behavior: serializeBehavior(component.behavior) }),
  };
}

function serializeRelationship(relationship: Relationship): Relationship {
  return {
    id: relationship.id,
    type: relationship.type,
    sourceId: relationship.sourceId,
    targetId: relationship.targetId,
    direction: relationship.direction,
    ...(relationship.label === undefined ? {} : { label: relationship.label }),
    ...(relationship.description === undefined ? {} : { description: relationship.description }),
    ...(relationship.visual === undefined ? {} : { visual: { ...relationship.visual } }),
  };
}

function serializeGroup(group: Group): Group {
  return {
    id: group.id,
    name: group.name,
    ...(group.description === undefined ? {} : { description: group.description }),
    ...(group.notes === undefined ? {} : { notes: group.notes }),
    memberComponentIds: [...group.memberComponentIds],
    bounds: {
      x: group.bounds.x,
      y: group.bounds.y,
      width: group.bounds.width,
      height: group.bounds.height,
    },
  };
}

function serializeArchitecture(architecture: Architecture): Architecture {
  const viewport = architecture.canvas?.viewport;
  return {
    id: architecture.id,
    name: architecture.name,
    ...(architecture.description === undefined ? {} : { description: architecture.description }),
    createdAt: architecture.createdAt,
    updatedAt: architecture.updatedAt,
    components: architecture.components.map(serializeComponent),
    relationships: architecture.relationships.map(serializeRelationship),
    groups: architecture.groups.map(serializeGroup),
    ...(viewport === undefined
      ? {}
      : { canvas: { viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom } } }),
  };
}

export function toArchitectureFile(architecture: Architecture): ArchitectureFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    architecture: serializeArchitecture(normalizeArchitecture(architecture)),
  };
}
