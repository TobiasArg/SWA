import {
  ACCESS_SCOPES,
  allowedDirections,
  DUPLICATE_OFFSET,
  DEFAULT_COMPONENT_NAMES,
  MAX_SIZE,
  MIN_SIZE,
  RELATIONSHIP_TYPES,
  STORE_KINDS,
  defaultDirection,
} from "./constants";
import { DomainError, type Command, type CommandResult } from "./commands";
import { computeGroupBounds, recomputeGroupBounds } from "./geometry";
import type {
  AgentBehavior,
  Architecture,
  Component,
  Direction,
  Group,
  Position,
  Relationship,
  Size,
} from "./types";

function fail(code: string, message: string): never {
  throw new DomainError(code, message);
}

function assertId(id: string, entity: string): void {
  if (typeof id !== "string" || id.length === 0 || id.length > 200) {
    fail("E_INVALID_ID", `${entity} IDs must be non-empty strings of at most 200 characters.`);
  }
}

function assertUniqueId(architecture: Architecture, id: string, entity: string): void {
  assertId(id, entity);
  const exists =
    architecture.components.some((component) => component.id === id) ||
    architecture.relationships.some((relationship) => relationship.id === id) ||
    architecture.groups.some((group) => group.id === id);
  if (exists) fail("E_DUPLICATE_ID", `ID ${id} is already used by an entity in this architecture.`);
}

function assertName(name: string, entity: string): void {
  if (typeof name !== "string" || name.trim().length === 0) {
    fail("E_NAME_REQUIRED", `${entity} name is required.`);
  }
}

function assertPosition(position: Position): void {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    fail("E_INVALID_POSITION", "Element positions must contain finite x and y coordinates.");
  }
}

function assertSize(size: Size): void {
  if (
    !size ||
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width <= 0 ||
    size.height <= 0
  ) {
    fail("E_INVALID_SIZE", "Component sizes must have finite, positive width and height.");
  }
}

function clampSize(size: Size): Size {
  return {
    width: Math.min(MAX_SIZE.width, Math.max(MIN_SIZE.width, size.width)),
    height: Math.min(MAX_SIZE.height, Math.max(MIN_SIZE.height, size.height)),
  };
}

function componentById(architecture: Architecture, id: string): Component {
  const component = architecture.components.find((candidate) => candidate.id === id);
  if (!component) fail("E_COMPONENT_NOT_FOUND", `Component ${id} does not exist.`);
  return component;
}

function relationshipById(architecture: Architecture, id: string): Relationship {
  const relationship = architecture.relationships.find((candidate) => candidate.id === id);
  if (!relationship) fail("E_RELATIONSHIP_NOT_FOUND", `Relationship ${id} does not exist.`);
  return relationship;
}

function groupById(architecture: Architecture, id: string): Group {
  const group = architecture.groups.find((candidate) => candidate.id === id);
  if (!group) fail("E_GROUP_NOT_FOUND", `Group ${id} does not exist.`);
  return group;
}

function copyComponent(component: Component, id = component.id): Component {
  const copy: Component = {
    ...component,
    id,
    position: { ...component.position },
    ...(component.size === undefined ? {} : { size: { ...component.size } }),
    ...(component.links === undefined
      ? {}
      : {
          links: component.links.map((link) => ({
            ...(link.label === undefined || link.label === "" ? {} : { label: link.label }),
            url: link.url,
          })),
        }),
    ...(component.properties === undefined ? {} : { properties: { ...component.properties } }),
    ...(component.behavior === undefined
      ? {}
      : {
          behavior: Object.fromEntries(
            Object.entries(component.behavior).map(([key, value]) => [
              key,
              Array.isArray(value) ? [...value] : value,
            ]),
          ) as AgentBehavior,
        }),
  };
  if (copy.subtype === undefined) delete copy.subtype;
  if (copy.description === undefined) delete copy.description;
  if (copy.notes === undefined) delete copy.notes;
  if (copy.links === undefined) delete copy.links;
  if (copy.size === undefined) delete copy.size;
  if (copy.properties === undefined) delete copy.properties;
  if (copy.behavior === undefined) delete copy.behavior;
  return copy;
}

function normalizeAddedComponent(component: Component): Component {
  const added = copyComponent(component);
  if (added.subtype === undefined) delete added.subtype;
  if (added.description === undefined || added.description === "") delete added.description;
  if (added.notes === undefined || added.notes === "") delete added.notes;
  if (!added.links?.length) delete added.links;
  if (added.properties !== undefined) {
    const properties = Object.fromEntries(Object.entries(added.properties).filter(([, value]) => value !== ""));
    if (Object.keys(properties).length === 0) delete added.properties;
    else added.properties = properties;
  }
  if (added.behavior !== undefined) {
    const behavior = Object.fromEntries(
      Object.entries(added.behavior).filter(([, value]) => value !== "" && !(Array.isArray(value) && value.length === 0)),
    );
    if (Object.keys(behavior).length === 0) delete added.behavior;
    else added.behavior = behavior as AgentBehavior;
  }
  return added;
}

function copyRelationship(relationship: Relationship): Relationship {
  const copy: Relationship = {
    ...relationship,
    ...(relationship.visual === undefined ? {} : { visual: { ...relationship.visual } }),
  };
  if (copy.visual === undefined) delete copy.visual;
  if (copy.label === undefined || copy.label === "") delete copy.label;
  if (copy.description === undefined || copy.description === "") delete copy.description;
  return copy;
}

function updateComponent(
  architecture: Architecture,
  id: string,
  patch: Partial<Pick<Component, "name" | "description" | "notes" | "links">>,
): Architecture {
  const component = componentById(architecture, id);
  const updated = copyComponent(component);

  if (Object.prototype.hasOwnProperty.call(patch, "name")) {
    assertName(patch.name ?? "", "Component");
    updated.name = patch.name as string;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "description")) {
    if (patch.description === undefined || patch.description === "") delete updated.description;
    else updated.description = patch.description;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "notes")) {
    if (patch.notes === undefined || patch.notes === "") delete updated.notes;
    else updated.notes = patch.notes;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "links")) {
    if (!patch.links?.length) delete updated.links;
    else {
      updated.links = patch.links.map((link) => ({
        ...(link.label === undefined || link.label === "" ? {} : { label: link.label }),
        url: link.url,
      }));
    }
  }

  if (JSON.stringify(component) === JSON.stringify(updated)) return architecture;
  return {
    ...architecture,
    components: architecture.components.map((candidate) => (candidate.id === id ? updated : candidate)),
  };
}

function setComponentProperty(
  architecture: Architecture,
  id: string,
  key: string,
  value: string | undefined,
): Architecture {
  const component = componentById(architecture, id);
  const normalizedValue = value === "" ? undefined : value;

  if (
    normalizedValue !== undefined &&
    key === "storeKind" &&
    !STORE_KINDS.includes(normalizedValue as (typeof STORE_KINDS)[number])
  ) {
    fail("E_INVALID_PROPERTY_VALUE", `Component ${id}: storeKind must be one of ${STORE_KINDS.join(", ")}.`);
  }
  if (
    normalizedValue !== undefined &&
    key === "accessScope" &&
    !ACCESS_SCOPES.includes(normalizedValue as (typeof ACCESS_SCOPES)[number])
  ) {
    fail("E_INVALID_PROPERTY_VALUE", `Component ${id}: accessScope must be one of ${ACCESS_SCOPES.join(", ")}.`);
  }

  const properties = { ...(component.properties ?? {}) };
  if (normalizedValue === undefined) delete properties[key];
  else properties[key] = normalizedValue;

  const hasProperties = Object.keys(properties).length > 0;
  if (JSON.stringify(component.properties ?? {}) === JSON.stringify(properties)) return architecture;

  const updated = copyComponent(component);
  if (hasProperties) updated.properties = properties;
  else delete updated.properties;
  return {
    ...architecture,
    components: architecture.components.map((candidate) => (candidate.id === id ? updated : candidate)),
  };
}

function updateBehavior(
  architecture: Architecture,
  id: string,
  patch: Partial<AgentBehavior>,
): Architecture {
  const component = componentById(architecture, id);
  if (component.type !== "agent") {
    fail("E_BEHAVIOR_NOT_ALLOWED", `Component ${id} (${component.type}) cannot have agent behavior fields.`);
  }

  const behavior: Partial<Record<keyof AgentBehavior, string | string[]>> = {
    ...(component.behavior ?? {}),
  };
  for (const key of Object.keys(patch) as Array<keyof AgentBehavior>) {
    const value = patch[key];
    if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
      delete behavior[key];
    } else if (Array.isArray(value)) {
      behavior[key] = [...value];
    } else {
      behavior[key] = value;
    }
  }

  const updated = copyComponent(component);
  if (Object.keys(behavior).length === 0) delete updated.behavior;
  else updated.behavior = behavior as AgentBehavior;
  if (JSON.stringify(component.behavior ?? {}) === JSON.stringify(behavior)) return architecture;

  return {
    ...architecture,
    components: architecture.components.map((candidate) => (candidate.id === id ? updated : candidate)),
  };
}

function updateGroup(
  architecture: Architecture,
  id: string,
  patch: { name?: string; description?: string; notes?: string },
): Architecture {
  const group = groupById(architecture, id);
  const updated = { ...group };

  if (Object.prototype.hasOwnProperty.call(patch, "name")) {
    assertName(patch.name ?? "", "Group");
    updated.name = patch.name as string;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "description")) {
    if (patch.description === undefined || patch.description === "") delete updated.description;
    else updated.description = patch.description;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "notes")) {
    if (patch.notes === undefined || patch.notes === "") delete updated.notes;
    else updated.notes = patch.notes;
  }

  if (JSON.stringify(group) === JSON.stringify(updated)) return architecture;
  return { ...architecture, groups: architecture.groups.map((candidate) => (candidate.id === id ? updated : candidate)) };
}

function deleteElements(
  architecture: Architecture,
  componentIds: string[],
  relationshipIds: string[],
  groupIds: string[],
): CommandResult {
  const removedComponentIds = new Set(componentIds.filter((id) => architecture.components.some((c) => c.id === id)));
  const removedGroupIds = new Set(groupIds.filter((id) => architecture.groups.some((g) => g.id === id)));
  const explicitRelationshipIds = new Set(
    relationshipIds.filter((id) => architecture.relationships.some((relationship) => relationship.id === id)),
  );
  const removedRelationships = new Set(explicitRelationshipIds);

  for (const relationship of architecture.relationships) {
    if (removedComponentIds.has(relationship.sourceId) || removedComponentIds.has(relationship.targetId)) {
      removedRelationships.add(relationship.id);
    }
  }

  const affectedGroups = new Set<string>();
  let components = architecture.components;
  let relationships = architecture.relationships;
  let groups = architecture.groups;

  if (removedComponentIds.size > 0) {
    components = architecture.components.filter((component) => !removedComponentIds.has(component.id));
    groups = architecture.groups.map((group) => {
      const memberComponentIds = group.memberComponentIds.filter((id) => !removedComponentIds.has(id));
      if (memberComponentIds.length === group.memberComponentIds.length) return group;
      affectedGroups.add(group.id);
      return { ...group, memberComponentIds };
    });
  }
  if (removedRelationships.size > 0) {
    relationships = architecture.relationships.filter((relationship) => !removedRelationships.has(relationship.id));
  }
  if (removedGroupIds.size > 0) groups = groups.filter((group) => !removedGroupIds.has(group.id));

  let next = architecture;
  if (
    components !== architecture.components ||
    relationships !== architecture.relationships ||
    groups !== architecture.groups
  ) {
    next = { ...architecture, components, relationships, groups };
    next = recomputeGroupBounds(next, affectedGroups);
  }

  return {
    architecture: next,
    summary: {
      deletedComponents: removedComponentIds.size,
      deletedRelationships: removedRelationships.size,
      deletedGroups: removedGroupIds.size,
    },
  };
}

function moveElements(
  architecture: Architecture,
  componentPositions: Record<string, Position>,
  groupDeltas: Record<string, Position>,
): Architecture {
  const positions = new Map<string, Position>();
  for (const [id, position] of Object.entries(componentPositions)) {
    assertPosition(position);
    componentById(architecture, id);
    positions.set(id, position);
  }

  const deltas = new Map<string, Position>();
  for (const [id, delta] of Object.entries(groupDeltas)) {
    assertPosition(delta);
    groupById(architecture, id);
    deltas.set(id, delta);
  }

  let changed = false;
  const components = architecture.components.map((component) => {
    const position = positions.get(component.id);
    if (!position || (position.x === component.position.x && position.y === component.position.y)) return component;
    changed = true;
    return { ...component, position: { x: position.x, y: position.y } };
  });

  const affectedGroups = new Set<string>();
  const groups = architecture.groups.map((group) => {
    const delta = deltas.get(group.id);
    if (delta) {
      affectedGroups.add(group.id);
      if (group.memberComponentIds.length === 0 && (delta.x !== 0 || delta.y !== 0)) {
        changed = true;
        return {
          ...group,
          bounds: {
            ...group.bounds,
            x: group.bounds.x + delta.x,
            y: group.bounds.y + delta.y,
          },
        };
      }
    }

    if (group.memberComponentIds.some((id) => positions.has(id))) affectedGroups.add(group.id);
    return group;
  });

  if (!changed && affectedGroups.size === 0) return architecture;
  let next: Architecture = { ...architecture, components, groups };
  next = recomputeGroupBounds(next, affectedGroups);
  if (
    next.components.every((component, index) => component === architecture.components[index]) &&
    next.groups.every((group, index) => group === architecture.groups[index])
  ) {
    return architecture;
  }
  return next;
}

function resizeComponent(architecture: Architecture, id: string, position: Position, size: Size): Architecture {
  const component = componentById(architecture, id);
  assertPosition(position);
  assertSize(size);
  const boundedSize = clampSize(size);

  if (
    component.position.x === position.x &&
    component.position.y === position.y &&
    component.size?.width === boundedSize.width &&
    component.size?.height === boundedSize.height
  ) {
    return architecture;
  }

  const components = architecture.components.map((candidate) =>
    candidate.id === id
      ? { ...candidate, position: { x: position.x, y: position.y }, size: boundedSize }
      : candidate,
  );
  const affectedGroups = architecture.groups
    .filter((group) => group.memberComponentIds.includes(id))
    .map((group) => group.id);
  return recomputeGroupBounds({ ...architecture, components }, affectedGroups);
}

function addRelationship(architecture: Architecture, relationship: Relationship): Architecture {
  assertUniqueId(architecture, relationship.id, "Relationship");
  if (!Object.prototype.hasOwnProperty.call(RELATIONSHIP_TYPES, relationship.type)) {
    fail("E_INVALID_RELATIONSHIP_TYPE", `Relationship type ${String(relationship.type)} is not supported.`);
  }

  const sourceIsComponent = architecture.components.some((component) => component.id === relationship.sourceId);
  const targetIsComponent = architecture.components.some((component) => component.id === relationship.targetId);
  if (!sourceIsComponent && architecture.groups.some((group) => group.id === relationship.sourceId)) {
    fail("E_GROUP_ENDPOINT", `Group ${relationship.sourceId} cannot be a relationship endpoint.`);
  }
  if (!targetIsComponent && architecture.groups.some((group) => group.id === relationship.targetId)) {
    fail("E_GROUP_ENDPOINT", `Group ${relationship.targetId} cannot be a relationship endpoint.`);
  }
  if (!sourceIsComponent) fail("E_ENDPOINT_NOT_FOUND", `Component ${relationship.sourceId} does not exist.`);
  if (!targetIsComponent) fail("E_ENDPOINT_NOT_FOUND", `Component ${relationship.targetId} does not exist.`);
  if (relationship.sourceId === relationship.targetId) {
    fail("E_SELF_RELATIONSHIP", `Relationship ${relationship.id} cannot connect a component to itself.`);
  }

  const allowed = allowedDirections(relationship.type);
  if (!allowed.includes(relationship.direction)) {
    fail("E_INVALID_DIRECTION", `Relationship ${relationship.id} of type ${relationship.type} must be ${allowed.join(" or ")}.`);
  }

  return { ...architecture, relationships: [...architecture.relationships, copyRelationship(relationship)] };
}

function updateRelationship(
  architecture: Architecture,
  id: string,
  patch: { label?: string; description?: string },
): Architecture {
  const relationship = relationshipById(architecture, id);
  const updated = copyRelationship(relationship);
  if (Object.prototype.hasOwnProperty.call(patch, "label")) {
    if (patch.label === undefined || patch.label === "") delete updated.label;
    else updated.label = patch.label;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "description")) {
    if (patch.description === undefined || patch.description === "") delete updated.description;
    else updated.description = patch.description;
  }

  if (JSON.stringify(relationship) === JSON.stringify(updated)) return architecture;
  return {
    ...architecture,
    relationships: architecture.relationships.map((candidate) => (candidate.id === id ? updated : candidate)),
  };
}

function retypeRelationship(architecture: Architecture, id: string, type: Relationship["type"]): Architecture {
  const relationship = relationshipById(architecture, id);
  if (!Object.prototype.hasOwnProperty.call(RELATIONSHIP_TYPES, type)) {
    fail("E_INVALID_RELATIONSHIP_TYPE", `Relationship type ${String(type)} is not supported.`);
  }
  const direction = type === "generic" ? relationship.direction : defaultDirection(type);
  if (relationship.type === type && relationship.direction === direction) return architecture;

  return {
    ...architecture,
    relationships: architecture.relationships.map((candidate) =>
      candidate.id === id ? { ...candidate, type, direction } : candidate,
    ),
  };
}

function setRelationshipDirection(
  architecture: Architecture,
  id: string,
  direction: Direction,
): Architecture {
  const relationship = relationshipById(architecture, id);
  if (relationship.type !== "generic") {
    fail("E_DIRECTION_FIXED", `Relationship ${id} has a direction fixed by its type.`);
  }
  if (direction !== "directed" && direction !== "undirected") {
    fail("E_INVALID_DIRECTION", `Direction ${String(direction)} is not supported.`);
  }
  if (relationship.direction === direction) return architecture;
  return {
    ...architecture,
    relationships: architecture.relationships.map((candidate) =>
      candidate.id === id ? { ...candidate, direction } : candidate,
    ),
  };
}

function reverseRelationship(architecture: Architecture, id: string): Architecture {
  const relationship = relationshipById(architecture, id);
  if (relationship.type !== "generic" || relationship.direction !== "directed") {
    fail("E_REVERSE_NOT_ALLOWED", `Only directed Generic relationships can be reversed.`);
  }
  return {
    ...architecture,
    relationships: architecture.relationships.map((candidate) =>
      candidate.id === id
        ? { ...candidate, sourceId: candidate.targetId, targetId: candidate.sourceId }
        : candidate,
    ),
  };
}

function createGroup(
  architecture: Architecture,
  id: string,
  name: string,
  memberIds: string[],
): Architecture {
  assertUniqueId(architecture, id, "Group");
  assertName(name, "Group");
  if (memberIds.length === 0) fail("E_EMPTY_GROUP", "A group must contain at least one component when it is created.");

  const uniqueMemberIds = new Set(memberIds);
  if (uniqueMemberIds.size !== memberIds.length) {
    fail("E_DUPLICATE_GROUP_MEMBER", "A component cannot appear more than once in a group.");
  }
  for (const memberId of memberIds) {
    if (architecture.groups.some((group) => group.id === memberId)) {
      fail("E_GROUP_AS_MEMBER", `Group ${memberId} cannot be a member of another group.`);
    }
  }
  const members = memberIds.map((memberId) => componentById(architecture, memberId));
  const memberSet = new Set(memberIds);
  const groups = architecture.groups.map((group) => {
    if (!group.memberComponentIds.some((memberId) => memberSet.has(memberId))) return group;
    return {
      ...group,
      memberComponentIds: group.memberComponentIds.filter((memberId) => !memberSet.has(memberId)),
    };
  });
  const newGroup: Group = {
    id,
    name,
    memberComponentIds: [...memberIds],
    bounds: computeGroupBounds(members),
  };
  const architectureWithGroups = { ...architecture, groups: [...groups, newGroup] };
  return recomputeGroupBounds(architectureWithGroups, groups.filter((group, index) => group !== architecture.groups[index]).map((group) => group.id));
}

function assignToGroup(
  architecture: Architecture,
  componentIds: string[],
  groupId: string | null,
): Architecture {
  const uniqueIds = [...new Set(componentIds)];
  const components = uniqueIds.map((id) => componentById(architecture, id));
  if (groupId !== null) groupById(architecture, groupId);
  if (uniqueIds.length === 0) return architecture;

  const assignments = new Map<string, string[]>();
  const movingIds = new Set(uniqueIds);
  for (const group of architecture.groups) {
    const filtered = group.memberComponentIds.filter((id) => group.id === groupId || !movingIds.has(id));
    assignments.set(group.id, filtered);
  }
  if (groupId !== null) {
    const target = assignments.get(groupId);
    if (target) {
      for (const component of components) {
        if (!target.includes(component.id)) target.push(component.id);
      }
    }
  }

  let changed = false;
  const affected = new Set<string>();
  const groups = architecture.groups.map((group) => {
    const memberComponentIds = assignments.get(group.id) ?? group.memberComponentIds;
    if (
      memberComponentIds.length === group.memberComponentIds.length &&
      memberComponentIds.every((memberId, index) => memberId === group.memberComponentIds[index])
    ) {
      return group;
    }
    changed = true;
    affected.add(group.id);
    return { ...group, memberComponentIds };
  });
  if (!changed) return architecture;
  return recomputeGroupBounds({ ...architecture, groups }, affected);
}

export function applyCommand(architecture: Architecture, command: Command): CommandResult {
  switch (command.kind) {
    case "addComponent": {
      const component = command.component;
      assertUniqueId(architecture, component.id, "Component");
      if (!Object.prototype.hasOwnProperty.call(DEFAULT_COMPONENT_NAMES, component.type)) {
        fail("E_INVALID_COMPONENT_TYPE", `Component type ${String(component.type)} is not supported.`);
      }
      if (component.type !== "agent" && component.subtype !== undefined) {
        fail("E_INVALID_SUBTYPE", `Component ${component.id}: subtype is only allowed on agents.`);
      }
      if (component.subtype !== undefined && component.subtype !== "orchestrator") {
        fail("E_INVALID_SUBTYPE", `Component ${component.id}: unknown subtype "${String(component.subtype)}".`);
      }
      if (component.type !== "agent" && component.behavior !== undefined) {
        fail("E_BEHAVIOR_NOT_ALLOWED", `Component ${component.id} (${component.type}) cannot have agent behavior fields.`);
      }
      assertName(component.name, "Component");
      assertPosition(component.position);
      if (component.size !== undefined) {
        assertSize(component.size);
      }
      return {
        architecture: {
          ...architecture,
          components: [
            ...architecture.components,
            {
              ...normalizeAddedComponent(component),
              ...(component.size === undefined ? {} : { size: clampSize(component.size) }),
            },
          ],
        },
      };
    }

    case "duplicateComponents": {
      const newIds = new Set<string>();
      const copies = command.items.map(({ sourceId, newId }) => {
        const source = componentById(architecture, sourceId);
        assertUniqueId(architecture, newId, "Component");
        if (newIds.has(newId)) fail("E_DUPLICATE_ID", `ID ${newId} is repeated in this duplicate command.`);
        newIds.add(newId);
        return {
          ...copyComponent(source, newId),
          name: `${source.name} (copy)`,
          position: {
            x: source.position.x + DUPLICATE_OFFSET.x,
            y: source.position.y + DUPLICATE_OFFSET.y,
          },
        };
      });
      if (copies.length === 0) return { architecture };
      return { architecture: { ...architecture, components: [...architecture.components, ...copies] } };
    }

    case "deleteElements":
      return deleteElements(architecture, command.componentIds, command.relationshipIds, command.groupIds);

    case "moveElements":
      return {
        architecture: moveElements(architecture, command.componentPositions, command.groupDeltas),
      };

    case "resizeComponent":
      return {
        architecture: resizeComponent(architecture, command.id, command.position, command.size),
      };

    case "updateComponent":
      return { architecture: updateComponent(architecture, command.id, command.patch) };

    case "setComponentProperty":
      return {
        architecture: setComponentProperty(architecture, command.id, command.key, command.value),
      };

    case "updateBehavior":
      return { architecture: updateBehavior(architecture, command.id, command.patch) };

    case "setSubtype": {
      const component = componentById(architecture, command.id);
      if (component.type !== "agent") {
        fail("E_INVALID_SUBTYPE", `Component ${command.id}: subtype "orchestrator" is only allowed on agents.`);
      }
      if (command.subtype !== undefined && command.subtype !== "orchestrator") {
        fail("E_INVALID_SUBTYPE", `Component ${command.id}: unknown subtype "${String(command.subtype)}".`);
      }
      if (component.subtype === command.subtype) return { architecture };
      return {
        architecture: {
          ...architecture,
          components: architecture.components.map((candidate) => {
            if (candidate.id !== command.id) return candidate;
            const updated = { ...candidate };
            if (command.subtype === undefined) delete updated.subtype;
            else updated.subtype = command.subtype;
            return updated;
          }),
        },
      };
    }

    case "addRelationship":
      return { architecture: addRelationship(architecture, command.relationship) };

    case "updateRelationship":
      return { architecture: updateRelationship(architecture, command.id, command.patch) };

    case "retypeRelationship":
      return { architecture: retypeRelationship(architecture, command.id, command.type) };

    case "setRelationshipDirection":
      return { architecture: setRelationshipDirection(architecture, command.id, command.direction) };

    case "reverseRelationship":
      return { architecture: reverseRelationship(architecture, command.id) };

    case "createGroup":
      return {
        architecture: createGroup(architecture, command.group.id, command.group.name, command.memberIds),
      };

    case "updateGroup":
      return { architecture: updateGroup(architecture, command.id, command.patch) };

    case "assignToGroup":
      return { architecture: assignToGroup(architecture, command.componentIds, command.groupId) };
  }
}
