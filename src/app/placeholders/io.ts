import { SCHEMA_VERSION, type Architecture, type ArchitectureFile } from "../../domain/types";
import {
  fileTooLargeIssue,
  jsonParseIssue,
  notArchitectureFileIssue,
  schemaVersionMissingIssue,
  schemaVersionUnsupportedIssue,
} from "../../domain/validation/issues";
import type { ImportResult } from "../../io/types";
import type { Repository } from "../../persistence/types";

/**
 * Placeholders for `io/importJson.ts`, `io/exportJson.ts`, `io/exportMarkdown.ts` and
 * `io/download.ts` (WS-B). The import only checks the envelope; full validation lands with
 * WS-B, and the Markdown export only writes a title and the element counts.
 */

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function placeholderExportArchitectureJson(architecture: Architecture): void {
  const file: ArchitectureFile = { schemaVersion: SCHEMA_VERSION, architecture };
  const json = `${JSON.stringify(file, null, 2)}\n`;
  download(new Blob([json], { type: "application/json" }), `${slug(architecture.name) || "architecture"}.json`);
}

export function placeholderExportArchitectureMarkdown(architecture: Architecture): void {
  const { name, components, relationships, groups } = architecture;
  const markdown = [
    `# ${name}`,
    "",
    `- Components: ${components.length}`,
    `- Relationships: ${relationships.length}`,
    `- Groups: ${groups.length}`,
    "",
  ].join("\n");
  download(new Blob([markdown], { type: "text/markdown" }), `${slug(name) || "architecture"}.md`);
}

export function placeholderExportRawJson(raw: unknown, name: string): void {
  const json = `${JSON.stringify(raw, null, 2)}\n`;
  download(new Blob([json], { type: "application/json" }), `${slug(name) || "architecture"}-raw.json`);
}

export async function placeholderImportArchitectureFile(
  file: File,
  repository: Repository,
  now: () => string,
): Promise<ImportResult> {
  if (file.size > MAX_IMPORT_BYTES) return { ok: false, issues: [fileTooLargeIssue()] };

  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch (error) {
    return { ok: false, issues: [jsonParseIssue(error instanceof Error ? error.message : String(error))] };
  }

  if (typeof raw !== "object" || raw === null || !("architecture" in raw)) {
    return { ok: false, issues: [notArchitectureFileIssue()] };
  }
  const record = raw as { schemaVersion?: unknown; architecture: unknown };
  if (typeof record.schemaVersion !== "number") return { ok: false, issues: [schemaVersionMissingIssue()] };
  if (record.schemaVersion < 1 || record.schemaVersion > SCHEMA_VERSION) {
    return { ok: false, issues: [schemaVersionUnsupportedIssue(record.schemaVersion)] };
  }
  const architecture = record.architecture as Architecture;
  if (
    typeof architecture !== "object" ||
    architecture === null ||
    typeof architecture.id !== "string" ||
    typeof architecture.name !== "string" ||
    !Array.isArray(architecture.components) ||
    !Array.isArray(architecture.relationships) ||
    !Array.isArray(architecture.groups)
  ) {
    return { ok: false, issues: [notArchitectureFileIssue()] };
  }

  const renamed = await repository.exists(architecture.id);
  const imported: ArchitectureFile = {
    schemaVersion: SCHEMA_VERSION,
    architecture: {
      ...architecture,
      ...(renamed ? { id: `arch_${crypto.randomUUID()}`, name: `${architecture.name} (imported)` } : {}),
      updatedAt: now(),
    },
  };
  await repository.put(imported);
  return { ok: true, file: imported, renamed };
}

export async function placeholderExportPng(): Promise<void> {
  throw new Error("PNG export is not available until the canvas module is integrated.");
}
