import { normalizeArchitecture } from "../normalize";
import { SCHEMA_VERSION, type Architecture, type ArchitectureFile } from "../types";
import {
  type ValidationIssue,
  type ValidationResult,
} from "./issues";
import { migrateArchitectureFile } from "./migrate";
import { parseArchitectureShape } from "./schema";
import { validateArchitecture } from "./validate";

export { MIGRATIONS, migrateArchitectureFile } from "./migrate";
export { architectureFileSchema, parseArchitectureShape } from "./schema";
export { validateArchitecture } from "./validate";
export {
  VALIDATION_CODES,
  displayId,
  fileTooLargeIssue,
  jsonParseIssue,
  notArchitectureFileIssue,
  schemaVersionMissingIssue,
  schemaVersionUnsupportedIssue,
  shapeIssue,
  limitExceededCountIssue,
  limitExceededTextIssue,
  duplicateIdIssue,
  danglingRelationshipIssue,
  groupAsEndpointIssue,
  selfRelationshipIssue,
  invalidDirectionIssue,
  invalidSubtypeIssue,
  behaviorNotAllowedIssue,
  invalidPropertyValueIssue,
  unknownMemberIssue,
  groupAsMemberIssue,
  multipleMembershipIssue,
  storageInvariantIssue,
} from "./issues";
export type { ValidationCode, ValidationIssue, ValidationResult } from "./issues";

export function parseArchitectureFile(raw: unknown): ValidationResult<ArchitectureFile> {
  const migrated = migrateArchitectureFile(raw);
  if (!migrated.ok) return migrated;

  const shaped = parseArchitectureShape(migrated.value);
  if (!shaped.ok) return shaped;

  const architecture = shaped.value.architecture as unknown as Architecture;
  const issues: ValidationIssue[] = validateArchitecture(architecture);
  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    value: {
      schemaVersion: SCHEMA_VERSION,
      architecture: normalizeArchitecture(architecture),
    },
  };
}
