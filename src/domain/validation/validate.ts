import { ACCESS_SCOPES, allowedDirections, isAccentId, STORE_KINDS } from "../constants";
import type { Architecture, Component, RelationshipType } from "../types";
import {
  behaviorNotAllowedIssue,
  danglingRelationshipIssue,
  duplicateIdIssue,
  groupAsEndpointIssue,
  groupAsMemberIssue,
  invalidAccentIssue,
  invalidDirectionIssue,
  invalidPropertyValueIssue,
  invalidSubtypeIssue,
  multipleMembershipIssue,
  selfRelationshipIssue,
  unknownMemberIssue,
  type ValidationIssue,
} from "./issues";

const relationshipTypeSet = new Set<string>([
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

function isRelationshipType(value: string): value is RelationshipType {
  return relationshipTypeSet.has(value);
}

function validateComponent(component: Component, issues: ValidationIssue[]): void {
  if (component.subtype !== undefined) {
    if (component.subtype !== "orchestrator") {
      issues.push(invalidSubtypeIssue(component.id, component.subtype, "unknown"));
    } else if (component.type !== "agent") {
      issues.push(invalidSubtypeIssue(component.id, component.subtype, "not-agent"));
    }
  }

  if (component.accent !== undefined && !isAccentId(component.accent)) {
    issues.push(invalidAccentIssue(component.id));
  }

  if (component.behavior !== undefined && component.type !== "agent") {
    issues.push(behaviorNotAllowedIssue(component.id, component.type));
  }

  const storeKind = component.properties?.storeKind;
  if (storeKind !== undefined && !(STORE_KINDS as readonly string[]).includes(storeKind)) {
    issues.push(invalidPropertyValueIssue(component.id, "storeKind", STORE_KINDS));
  }
  const accessScope = component.properties?.accessScope;
  if (accessScope !== undefined && !(ACCESS_SCOPES as readonly string[]).includes(accessScope)) {
    issues.push(invalidPropertyValueIssue(component.id, "accessScope", ACCESS_SCOPES));
  }
}

/** Semantic and referential checks only; the caller must shape-check first. */
export function validateArchitecture(architecture: Architecture): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const componentIds = new Set(architecture.components.map((component) => component.id));
  const groupIds = new Set(architecture.groups.map((group) => group.id));

  const idOccurrences = new Map<string, { count: number; kinds: Set<string> }>();
  const recordIds = (ids: string[], kind: string): void => {
    for (const id of ids) {
      const occurrence = idOccurrences.get(id) ?? { count: 0, kinds: new Set<string>() };
      occurrence.count += 1;
      occurrence.kinds.add(kind);
      idOccurrences.set(id, occurrence);
    }
  };
  recordIds(architecture.components.map((component) => component.id), "components");
  recordIds(architecture.relationships.map((relationship) => relationship.id), "relationships");
  recordIds(architecture.groups.map((group) => group.id), "groups");
  for (const [id, occurrence] of idOccurrences) {
    if (occurrence.count > 1) {
      issues.push(duplicateIdIssue(id, [...occurrence.kinds].join(" and ")));
    }
  }

  for (const component of architecture.components) validateComponent(component, issues);

  for (const relationship of architecture.relationships) {
    for (const field of ["sourceId", "targetId"] as const) {
      const endpointId = relationship[field];
      if (groupIds.has(endpointId)) {
        issues.push(groupAsEndpointIssue(relationship.id, endpointId, field));
      } else if (!componentIds.has(endpointId)) {
        issues.push(danglingRelationshipIssue(relationship.id, endpointId, field));
      }
    }
    if (relationship.sourceId === relationship.targetId) {
      issues.push(selfRelationshipIssue(relationship.id, relationship.sourceId));
    }
    if (isRelationshipType(relationship.type)) {
      const allowed = allowedDirections(relationship.type);
      if (!allowed.includes(relationship.direction)) {
        issues.push(invalidDirectionIssue(relationship.id, relationship.type, allowed));
      }
    }
  }

  const componentMemberships = new Map<string, string[]>();
  for (const group of architecture.groups) {
    for (const memberId of group.memberComponentIds) {
      if (groupIds.has(memberId)) {
        issues.push(groupAsMemberIssue(group.id, memberId));
      } else if (!componentIds.has(memberId)) {
        issues.push(unknownMemberIssue(group.id, memberId));
      } else {
        const memberships = componentMemberships.get(memberId) ?? [];
        memberships.push(group.id);
        componentMemberships.set(memberId, memberships);
      }
    }
  }
  for (const [componentId, memberships] of componentMemberships) {
    if (memberships.length > 1) {
      issues.push(multipleMembershipIssue(componentId, memberships));
    }
  }

  return issues;
}
