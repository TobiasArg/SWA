import { ACCENT_IDS, COMPONENT_TYPE_LABELS, RELATIONSHIP_TYPES } from "../constants";
import type { ComponentType, RelationshipType } from "../types";

export const VALIDATION_CODES = [
  "E_FILE_TOO_LARGE",
  "E_JSON_PARSE",
  "E_NOT_ARCHITECTURE_FILE",
  "E_SCHEMA_VERSION_MISSING",
  "E_SCHEMA_VERSION_UNSUPPORTED",
  "E_SHAPE",
  "E_LIMIT_EXCEEDED",
  "E_DUPLICATE_ID",
  "E_DANGLING_RELATIONSHIP",
  "E_GROUP_AS_ENDPOINT",
  "E_SELF_RELATIONSHIP",
  "E_INVALID_DIRECTION",
  "E_INVALID_SUBTYPE",
  "E_INVALID_ACCENT",
  "E_BEHAVIOR_NOT_ALLOWED",
  "E_INVALID_PROPERTY_VALUE",
  "E_UNKNOWN_MEMBER",
  "E_GROUP_AS_MEMBER",
  "E_MULTIPLE_MEMBERSHIP",
  "E_STORAGE_INVARIANT",
] as const;

export type ValidationCode = (typeof VALIDATION_CODES)[number];

export interface ValidationIssue {
  code: ValidationCode;
  path: string;
  message: string;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; issues: ValidationIssue[] };

const MAX_ID_DISPLAY_LENGTH = 80;

export function displayId(id: string): string {
  return id.length > MAX_ID_DISPLAY_LENGTH
    ? `${id.slice(0, MAX_ID_DISPLAY_LENGTH - 1)}…`
    : id;
}

function makeIssue(code: ValidationCode, path: string, message: string): ValidationIssue {
  return { code, path, message };
}

export function fileTooLargeIssue(): ValidationIssue {
  return makeIssue("E_FILE_TOO_LARGE", "", "The file is larger than 5 MB and cannot be imported.");
}

export function jsonParseIssue(parserMessage: string): ValidationIssue {
  return makeIssue("E_JSON_PARSE", "", `The file is not valid JSON (${parserMessage}).`);
}

export function notArchitectureFileIssue(): ValidationIssue {
  return makeIssue(
    "E_NOT_ARCHITECTURE_FILE",
    "",
    "This file is not a Swarm Architecturer architecture file.",
  );
}

export function schemaVersionMissingIssue(): ValidationIssue {
  return makeIssue(
    "E_SCHEMA_VERSION_MISSING",
    "schemaVersion",
    "The file has no schemaVersion, so its format cannot be determined.",
  );
}

export function schemaVersionUnsupportedIssue(version: unknown): ValidationIssue {
  return makeIssue(
    "E_SCHEMA_VERSION_UNSUPPORTED",
    "schemaVersion",
    `The file uses format version ${String(version)}. This version of Swarm Architecturer supports format version 1 only.`,
  );
}

export function shapeIssue(path: string, reason: string): ValidationIssue {
  return makeIssue("E_SHAPE", path, `${path}: ${reason}`);
}

export function limitExceededCountIssue(path: string, count: number, maximum: number): ValidationIssue {
  return makeIssue(
    "E_LIMIT_EXCEEDED",
    path,
    `${path}: too many items (${count}; the maximum is ${maximum}).`,
  );
}

export function limitExceededTextIssue(path: string, maximum: number): ValidationIssue {
  return makeIssue("E_LIMIT_EXCEEDED", path, `${path}: text is longer than ${maximum} characters.`);
}

export function duplicateIdIssue(id: string, kinds: string): ValidationIssue {
  return makeIssue(
    "E_DUPLICATE_ID",
    "",
    `ID ${displayId(id)} is used more than once (${kinds}).`,
  );
}

export function danglingRelationshipIssue(
  relationshipId: string,
  componentId: string,
  field: "sourceId" | "targetId",
): ValidationIssue {
  return makeIssue(
    "E_DANGLING_RELATIONSHIP",
    `relationships.${relationshipId}.${field}`,
    `Relationship ${displayId(relationshipId)} references unknown component ${displayId(componentId)} (${field}).`,
  );
}

export function groupAsEndpointIssue(
  relationshipId: string,
  groupId: string,
  field: "sourceId" | "targetId",
): ValidationIssue {
  return makeIssue(
    "E_GROUP_AS_ENDPOINT",
    `relationships.${relationshipId}.${field}`,
    `Relationship ${displayId(relationshipId)} uses group ${displayId(groupId)} as its ${field}. Groups cannot be relationship endpoints.`,
  );
}

export function selfRelationshipIssue(relationshipId: string, componentId: string): ValidationIssue {
  return makeIssue(
    "E_SELF_RELATIONSHIP",
    `relationships.${relationshipId}`,
    `Relationship ${displayId(relationshipId)} connects component ${displayId(componentId)} to itself.`,
  );
}

export function invalidDirectionIssue(
  relationshipId: string,
  type: RelationshipType,
  allowed: readonly string[],
): ValidationIssue {
  const allowedText = allowed.join(" or ");
  return makeIssue(
    "E_INVALID_DIRECTION",
    `relationships.${relationshipId}.direction`,
    `Relationship ${displayId(relationshipId)} of type ${RELATIONSHIP_TYPES[type].label} must be ${allowedText}.`,
  );
}

export function invalidAccentIssue(componentId: string): ValidationIssue {
  return makeIssue(
    "E_INVALID_ACCENT",
    `components.${componentId}.accent`,
    `Component ${displayId(componentId)}: accent must be one of ${ACCENT_IDS.join(", ")}.`,
  );
}

export function invalidSubtypeIssue(
  componentId: string,
  subtype: unknown,
  reason: "not-agent" | "unknown",
): ValidationIssue {
  const detail =
    reason === "not-agent"
      ? 'subtype "orchestrator" is only allowed on agents.'
      : `unknown subtype "${String(subtype)}".`;
  return makeIssue(
    "E_INVALID_SUBTYPE",
    `components.${componentId}.subtype`,
    `Component ${displayId(componentId)}: ${detail}`,
  );
}

export function behaviorNotAllowedIssue(componentId: string, type: ComponentType): ValidationIssue {
  return makeIssue(
    "E_BEHAVIOR_NOT_ALLOWED",
    `components.${componentId}.behavior`,
    `Component ${displayId(componentId)} (${COMPONENT_TYPE_LABELS[type]}) cannot have agent behavior fields.`,
  );
}

export function invalidPropertyValueIssue(
  componentId: string,
  key: string,
  values: readonly string[],
): ValidationIssue {
  return makeIssue(
    "E_INVALID_PROPERTY_VALUE",
    `components.${componentId}.properties.${key}`,
    `Component ${displayId(componentId)}: ${key} must be one of ${values.join(", ")}.`,
  );
}

export function unknownMemberIssue(groupId: string, componentId: string): ValidationIssue {
  return makeIssue(
    "E_UNKNOWN_MEMBER",
    `groups.${groupId}.memberComponentIds`,
    `Group ${displayId(groupId)} lists unknown component ${displayId(componentId)} as a member.`,
  );
}

export function groupAsMemberIssue(groupId: string, nestedGroupId: string): ValidationIssue {
  return makeIssue(
    "E_GROUP_AS_MEMBER",
    `groups.${groupId}.memberComponentIds`,
    `Group ${displayId(groupId)} lists group ${displayId(nestedGroupId)} as a member. Groups cannot be nested.`,
  );
}

export function multipleMembershipIssue(componentId: string, groupIds: readonly string[]): ValidationIssue {
  return makeIssue(
    "E_MULTIPLE_MEMBERSHIP",
    "groups",
    `Component ${displayId(componentId)} belongs to more than one group (${groupIds.map(displayId).join(", ")}).`,
  );
}

export function storageInvariantIssue(firstIssue: string): ValidationIssue {
  return makeIssue(
    "E_STORAGE_INVARIANT",
    "",
    `The architecture could not be saved because it is internally inconsistent: ${firstIssue}.`,
  );
}
