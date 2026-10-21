import type { ArchitectureFile } from "../domain/types";
import type { ValidationIssue } from "../domain/validation/issues";

export type StoredRecord =
  | { status: "ok"; file: ArchitectureFile }
  | { status: "damaged"; id: string; name: string; issues: ValidationIssue[]; raw: unknown };

export interface Repository {
  list(): Promise<StoredRecord[]>;
  get(id: string): Promise<StoredRecord | undefined>;
  put(file: ArchitectureFile): Promise<void>;
  create(name: string): Promise<ArchitectureFile>;
  duplicate(id: string): Promise<ArchitectureFile>;
  rename(id: string, name: string): Promise<void>;
  remove(id: string): Promise<void>;
  exists(id: string): Promise<boolean>;
}

export type SaveStatus = "saved" | "pending" | "saving" | "error";

export interface SaveController {
  getStatus(): { status: SaveStatus; error?: string };
  subscribe(listener: () => void): () => void;
  flush(): Promise<boolean>;
  retry(): void;
  dispose(): void;
}
