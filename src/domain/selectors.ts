import { RELATIONSHIP_TYPES } from "./constants";
import type { Architecture, Component, Group, Relationship } from "./types";

export function getComponent(architecture: Architecture, id: string): Component | undefined {
  return architecture.components.find((component) => component.id === id);
}

export function getGroupOfComponent(architecture: Architecture, id: string): Group | undefined {
  return architecture.groups.find((group) => group.memberComponentIds.includes(id));
}

export function getRelationshipsOf(
  architecture: Architecture,
  id: string,
): { outgoing: Relationship[]; incoming: Relationship[]; undirected: Relationship[] } {
  const outgoing: Relationship[] = [];
  const incoming: Relationship[] = [];
  const undirected: Relationship[] = [];

  for (const relationship of architecture.relationships) {
    if (relationship.direction === "undirected") {
      if (relationship.sourceId === id || relationship.targetId === id) undirected.push(relationship);
    } else if (relationship.sourceId === id) {
      outgoing.push(relationship);
    } else if (relationship.targetId === id) {
      incoming.push(relationship);
    }
  }

  return { outgoing, incoming, undirected };
}

export function relationshipDisplayLabel(relationship: Relationship): string {
  const verb = RELATIONSHIP_TYPES[relationship.type].verb;
  const label = relationship.label || undefined;
  if (relationship.type === "generic") return label ?? verb;
  return label === undefined ? verb : `${verb} · ${label}`;
}

function undirectedEndpoints(architecture: Architecture, relationship: Relationship) {
  const source = getComponent(architecture, relationship.sourceId);
  const target = getComponent(architecture, relationship.targetId);
  const endpoints = [
    { id: relationship.sourceId, name: source?.name ?? relationship.sourceId },
    { id: relationship.targetId, name: target?.name ?? relationship.targetId },
  ];

  endpoints.sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
  return endpoints;
}

export function describeRelationship(architecture: Architecture, relationship: Relationship): string {
  if (relationship.direction === "undirected") {
    const [first, second] = undirectedEndpoints(architecture, relationship);
    const left = first?.name ?? relationship.sourceId;
    const right = second?.name ?? relationship.targetId;
    if (relationship.type === "shares_context_with") {
      return `${left} and ${right} share context${relationship.label ? `: ${relationship.label}` : ""}.`;
    }
    return `${left} and ${right} are related${relationship.label ? ` by ${relationship.label}` : ""}.`;
  }

  const sourceName = getComponent(architecture, relationship.sourceId)?.name ?? relationship.sourceId;
  const targetName = getComponent(architecture, relationship.targetId)?.name ?? relationship.targetId;
  const verb =
    relationship.type === "generic"
      ? relationship.label || RELATIONSHIP_TYPES.generic.verb
      : RELATIONSHIP_TYPES[relationship.type].verb;
  const label = relationship.type === "generic" ? undefined : relationship.label;
  return `${sourceName} ${verb} ${targetName}${label ? ` (label: ${label})` : ""}.`;
}
