import { toArchitectureFile } from "../domain/serialize";
import type { Architecture } from "../domain/types";
import { download } from "./download";

export function slugifyArchitectureName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

export function architectureJsonFilename(name: string): string {
  return `${slugifyArchitectureName(name) || "architecture"}.json`;
}

export function rawArchitectureJsonFilename(name: string): string {
  return `${slugifyArchitectureName(name) || "architecture"}-raw.json`;
}

export function exportArchitectureJson(architecture: Architecture): string {
  return `${JSON.stringify(toArchitectureFile(architecture), null, 2)}\n`;
}

export function exportRawArchitectureJson(raw: unknown): string {
  return `${JSON.stringify(raw, null, 2) ?? "null"}\n`;
}

export function downloadArchitectureJson(architecture: Architecture): void {
  download(
    new Blob([exportArchitectureJson(architecture)], { type: "application/json" }),
    architectureJsonFilename(architecture.name),
  );
}

export function downloadRawArchitectureJson(raw: unknown, name: string): void {
  download(
    new Blob([exportRawArchitectureJson(raw)], { type: "application/json" }),
    rawArchitectureJsonFilename(name),
  );
}
