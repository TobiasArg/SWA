import { describe, expect, it } from "vitest";
import {
  VALIDATION_CODES,
  behaviorNotAllowedIssue,
  danglingRelationshipIssue,
  displayId,
  duplicateIdIssue,
  fileTooLargeIssue,
  groupAsEndpointIssue,
  invalidDirectionIssue,
  invalidPropertyValueIssue,
  invalidSubtypeIssue,
  jsonParseIssue,
  limitExceededCountIssue,
  limitExceededTextIssue,
  multipleMembershipIssue,
  notArchitectureFileIssue,
  schemaVersionMissingIssue,
  schemaVersionUnsupportedIssue,
  selfRelationshipIssue,
  shapeIssue,
  storageInvariantIssue,
  unknownMemberIssue,
  groupAsMemberIssue,
} from "./issues";

describe("validation issue contracts", () => {
  it("declares every issue code from the schema contract", () => {
    expect(VALIDATION_CODES).toEqual([
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
    ]);
  });

  it("formats the file, parsing, version, shape and limit messages", () => {
    expect(fileTooLargeIssue().message).toBe("The file is larger than 5 MB and cannot be imported.");
    expect(jsonParseIssue("Unexpected token").message).toBe(
      "The file is not valid JSON (Unexpected token).",
    );
    expect(notArchitectureFileIssue().message).toBe(
      "This file is not a Swarm Architecturer architecture file.",
    );
    expect(schemaVersionMissingIssue().message).toBe(
      "The file has no schemaVersion, so its format cannot be determined.",
    );
    expect(schemaVersionUnsupportedIssue(3).message).toBe(
      "The file uses format version 3. This version of Swarm Architecturer supports format version 1 only.",
    );
    expect(shapeIssue("architecture.name", "expected a non-empty text value.").message).toBe(
      "architecture.name: expected a non-empty text value.",
    );
    expect(limitExceededCountIssue("architecture.components", 1001, 1000).message).toBe(
      "architecture.components: too many items (1001; the maximum is 1000).",
    );
    expect(limitExceededTextIssue("architecture.name", 50_000).message).toBe(
      "architecture.name: text is longer than 50000 characters.",
    );
  });

  it("formats semantic issues using human-readable labels and shortened IDs", () => {
    const longId = "x".repeat(100);
    expect(displayId(longId)).toBe(`${"x".repeat(79)}…`);
    expect(displayId(longId)).toHaveLength(80);
    expect(duplicateIdIssue(longId, "components and groups").message).toBe(
      `ID ${"x".repeat(79)}… is used more than once (components and groups).`,
    );
    expect(danglingRelationshipIssue("rel_1", "cmp_missing", "sourceId").message).toBe(
      "Relationship rel_1 references unknown component cmp_missing (sourceId).",
    );
    expect(groupAsEndpointIssue("rel_1", "grp_1", "targetId").message).toBe(
      "Relationship rel_1 uses group grp_1 as its targetId. Groups cannot be relationship endpoints.",
    );
    expect(selfRelationshipIssue("rel_1", "cmp_1").message).toBe(
      "Relationship rel_1 connects component cmp_1 to itself.",
    );
    expect(invalidDirectionIssue("rel_1", "shares_context_with", ["undirected"]).message).toBe(
      "Relationship rel_1 of type Shares Context With must be undirected.",
    );
    expect(invalidSubtypeIssue("cmp_tool", "worker", "unknown").message).toBe(
      'Component cmp_tool: unknown subtype "worker".',
    );
    expect(invalidSubtypeIssue("cmp_tool", "orchestrator", "not-agent").message).toBe(
      'Component cmp_tool: subtype "orchestrator" is only allowed on agents.',
    );
    expect(behaviorNotAllowedIssue("cmp_tool", "tool").message).toBe(
      "Component cmp_tool (Tool) cannot have agent behavior fields.",
    );
    expect(invalidPropertyValueIssue("cmp_store", "storeKind", ["memory", "vector"]).message).toBe(
      "Component cmp_store: storeKind must be one of memory, vector.",
    );
    expect(unknownMemberIssue("grp_1", "cmp_missing").message).toBe(
      "Group grp_1 lists unknown component cmp_missing as a member.",
    );
    expect(groupAsMemberIssue("grp_1", "grp_2").message).toBe(
      "Group grp_1 lists group grp_2 as a member. Groups cannot be nested.",
    );
    expect(multipleMembershipIssue("cmp_1", ["grp_1", "grp_2"]).message).toBe(
      "Component cmp_1 belongs to more than one group (grp_1, grp_2).",
    );
    expect(storageInvariantIssue("first validation issue").message).toBe(
      "The architecture could not be saved because it is internally inconsistent: first validation issue.",
    );
  });
});
