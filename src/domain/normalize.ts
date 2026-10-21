import { MAX_SIZE, MIN_SIZE } from "./constants";
import { recomputeGroupBounds } from "./geometry";
import type { AgentBehavior, Architecture, Component, ExternalLink, Group } from "./types";

function optionalString(value: string | undefined): string | undefined {
  return value === "" ? undefined : value;
}

function normalizeLinks(links: ExternalLink[] | undefined): ExternalLink[] | undefined {
  if (!links?.length) return undefined;

  return links.map((link) => {
    const label = optionalString(link.label);
    return label === undefined ? { url: link.url } : { label, url: link.url };
  });
}

function normalizeBehavior(behavior: AgentBehavior | undefined): AgentBehavior | undefined {
  if (!behavior) return undefined;

  const result: AgentBehavior = {};
  const purpose = optionalString(behavior.purpose);
  const role = optionalString(behavior.role);
  const responsibilities = behavior.responsibilities?.length ? [...behavior.responsibilities] : undefined;
  const boundaries = behavior.boundaries?.length ? [...behavior.boundaries] : undefined;
  const activation = optionalString(behavior.activation);
  const rules = behavior.rules?.length ? [...behavior.rules] : undefined;
  const delegation = optionalString(behavior.delegation);
  const outputs = optionalString(behavior.outputs);
  const failureHandling = optionalString(behavior.failureHandling);

  if (purpose !== undefined) result.purpose = purpose;
  if (role !== undefined) result.role = role;
  if (responsibilities !== undefined) result.responsibilities = responsibilities;
  if (boundaries !== undefined) result.boundaries = boundaries;
  if (activation !== undefined) result.activation = activation;
  if (rules !== undefined) result.rules = rules;
  if (delegation !== undefined) result.delegation = delegation;
  if (outputs !== undefined) result.outputs = outputs;
  if (failureHandling !== undefined) result.failureHandling = failureHandling;

  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeComponent(component: Component): Component {
  const description = optionalString(component.description);
  const notes = optionalString(component.notes);
  const links = normalizeLinks(component.links);
  const properties = component.properties
    ? Object.fromEntries(Object.entries(component.properties).filter(([, value]) => value !== ""))
    : undefined;
  const behavior = normalizeBehavior(component.behavior);
  const size = component.size
    ? {
        width: Math.min(MAX_SIZE.width, Math.max(MIN_SIZE.width, component.size.width)),
        height: Math.min(MAX_SIZE.height, Math.max(MIN_SIZE.height, component.size.height)),
      }
    : undefined;

  return {
    id: component.id,
    type: component.type,
    ...(component.subtype === undefined ? {} : { subtype: component.subtype }),
    name: component.name,
    ...(description === undefined ? {} : { description }),
    ...(notes === undefined ? {} : { notes }),
    ...(links === undefined ? {} : { links }),
    position: { x: component.position.x, y: component.position.y },
    ...(size === undefined ? {} : { size }),
    ...(properties === undefined || Object.keys(properties).length === 0 ? {} : { properties }),
    ...(behavior === undefined ? {} : { behavior }),
  };
}

function normalizeGroup(group: Group): Group {
  const description = optionalString(group.description);
  const notes = optionalString(group.notes);

  return {
    id: group.id,
    name: group.name,
    ...(description === undefined ? {} : { description }),
    ...(notes === undefined ? {} : { notes }),
    memberComponentIds: [...group.memberComponentIds],
    bounds: {
      x: group.bounds.x,
      y: group.bounds.y,
      width: group.bounds.width,
      height: group.bounds.height,
    },
  };
}

export function normalizeArchitecture(architecture: Architecture): Architecture {
  const description = optionalString(architecture.description);
  const groups = architecture.groups.map(normalizeGroup);
  const viewport = architecture.canvas?.viewport;
  const normalized: Architecture = {
    id: architecture.id,
    name: architecture.name,
    ...(description === undefined ? {} : { description }),
    createdAt: architecture.createdAt,
    updatedAt: architecture.updatedAt,
    components: architecture.components.map(normalizeComponent),
    relationships: architecture.relationships.map((relationship) => {
      const label = optionalString(relationship.label);
      const relationshipDescription = optionalString(relationship.description);
      return {
        id: relationship.id,
        type: relationship.type,
        sourceId: relationship.sourceId,
        targetId: relationship.targetId,
        direction: relationship.direction,
        ...(label === undefined ? {} : { label }),
        ...(relationshipDescription === undefined ? {} : { description: relationshipDescription }),
        ...(relationship.visual === undefined ? {} : { visual: { ...relationship.visual } }),
      };
    }),
    groups,
    ...(viewport === undefined
      ? {}
      : { canvas: { viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom } } }),
  };

  return recomputeGroupBounds(normalized, normalized.groups.map((group) => group.id));
}
