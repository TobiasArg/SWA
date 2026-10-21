import type { ArchitectureFile } from "../domain/types";
import type { ValidationIssue } from "../domain/validation/issues";

export type ImportResult =
  | { ok: true; file: ArchitectureFile; renamed: boolean }
  | { ok: false; issues: ValidationIssue[] };
