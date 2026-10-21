import { SCHEMA_VERSION } from "../types";
import {
  notArchitectureFileIssue,
  schemaVersionMissingIssue,
  schemaVersionUnsupportedIssue,
  type ValidationResult,
} from "./issues";

export type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/** Future migrations are keyed by the schema version they upgrade from. */
export const MIGRATIONS: Record<number, Migration> = {};

export function migrateArchitectureFile(raw: unknown): ValidationResult<Record<string, unknown>> {
  if (
    raw === null ||
    typeof raw !== "object" ||
    Array.isArray(raw) ||
    !Object.prototype.hasOwnProperty.call(raw, "architecture")
  ) {
    return { ok: false, issues: [notArchitectureFileIssue()] };
  }

  const source = raw as Record<string, unknown>;
  const version = source.schemaVersion;
  if (typeof version !== "number" || !Number.isFinite(version)) {
    return { ok: false, issues: [schemaVersionMissingIssue()] };
  }
  if (!Number.isInteger(version) || version < 1 || version > SCHEMA_VERSION) {
    return { ok: false, issues: [schemaVersionUnsupportedIssue(version)] };
  }

  let migrated: Record<string, unknown> = { ...source };
  for (let fromVersion = version; fromVersion < SCHEMA_VERSION; fromVersion += 1) {
    const migration = MIGRATIONS[fromVersion];
    if (!migration) {
      return { ok: false, issues: [schemaVersionUnsupportedIssue(version)] };
    }
    migrated = migration(migrated);
    migrated.schemaVersion = fromVersion + 1;
  }

  return { ok: true, value: migrated };
}
