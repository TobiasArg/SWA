import { DEFAULT_COMPONENT_NAMES, defaultDirection } from "./constants";
import { createId } from "./ids";
import type {
  Architecture,
  Component,
  ComponentType,
  Group,
  Relationship,
  RelationshipType,
  Position,
} from "./types";

export interface CreateComponentOptions {
  subtype?: "orchestrator";
  position: Position;
  existingNames: Iterable<string>;
}

function uniqueName(baseName: string, existingNames: Iterable<string>): string {
  const existing = new Set(existingNames);
  if (!existing.has(baseName)) return baseName;

  let suffix = 2;
  while (existing.has(`${baseName} ${suffix}`)) suffix += 1;
  return `${baseName} ${suffix}`;
}

export function createComponent(type: ComponentType, options: CreateComponentOptions): Component {
  if (options.subtype !== undefined && type !== "agent") {
    throw new TypeError('The "orchestrator" subtype is only allowed for agents.');
  }

  const baseName = options.subtype === "orchestrator" ? "Orchestrator" : DEFAULT_COMPONENT_NAMES[type];
  return {
    id: createId("cmp"),
    type,
    ...(options.subtype === undefined ? {} : { subtype: options.subtype }),
    name: uniqueName(baseName, options.existingNames),
    position: { x: options.position.x, y: options.position.y },
  };
}

export function createRelationship(
  type: RelationshipType,
  sourceId: string,
  targetId: string,
): Relationship {
  return {
    id: createId("rel"),
    type,
    sourceId,
    targetId,
    direction: defaultDirection(type),
  };
}

export function createGroup(name: string): Group {
  return {
    id: createId("grp"),
    name,
    memberComponentIds: [],
    bounds: { x: 0, y: 0, width: 0, height: 0 },
  };
}

export function createArchitecture(name: string, now: string = new Date().toISOString()): Architecture {
  return {
    id: createId("arch"),
    name,
    createdAt: now,
    updatedAt: now,
    components: [],
    relationships: [],
    groups: [],
  };
}
