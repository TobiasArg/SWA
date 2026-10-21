import type { IDBPDatabase } from "idb";
import { createArchitecture } from "../domain/factories";
import { createId } from "../domain/ids";
import { toArchitectureFile } from "../domain/serialize";
import { SCHEMA_VERSION, type Architecture, type ArchitectureFile } from "../domain/types";
import {
  parseArchitectureFile,
  storageInvariantIssue,
  validateArchitecture,
  type ValidationIssue,
} from "../domain/validation";
import type { Repository, StoredRecord } from "./types";
import {
  ARCHITECTURES_STORE,
  DATABASE_NAME,
  openDatabase,
  type SwarmArchitecturerDatabase,
} from "./db";
import { notifyArchitectureChanged } from "./tabSync";

type Database = Awaited<ReturnType<typeof openDatabase>>;

export class StorageUnavailableError extends Error {
  constructor(message = "Local storage is unavailable in this browser.") {
    super(message);
    this.name = "StorageUnavailableError";
  }
}

export class SaveError extends Error {
  readonly issues: ValidationIssue[];

  constructor(message: string, issues: ValidationIssue[] = []) {
    super(message);
    this.name = "SaveError";
    this.issues = issues;
  }
}

export class RecordNotFoundError extends Error {
  constructor(id: string) {
    super(`Architecture ${id} was not found.`);
    this.name = "RecordNotFoundError";
  }
}

export class DamagedRecordError extends Error {
  constructor(id: string) {
    super(`Architecture ${id} is damaged and cannot be edited.`);
    this.name = "DamagedRecordError";
  }
}

function asId(value: unknown): string {
  return typeof value === "string" ? value : "(unknown)";
}

function damagedRecord(raw: unknown, issues: ValidationIssue[]): StoredRecord {
  const architecture =
    raw !== null && typeof raw === "object"
      ? (raw as { architecture?: unknown }).architecture
      : undefined;
  const details =
    architecture !== null && typeof architecture === "object"
      ? (architecture as { id?: unknown; name?: unknown })
      : undefined;
  return {
    status: "damaged",
    id: asId(details?.id),
    name: asId(details?.name),
    issues,
    raw,
  };
}

function storageError(error: unknown): SaveError {
  const message =
    error instanceof Error
      ? error.message
      : error !== null && typeof error === "object" && "message" in error
        ? String(error.message)
        : "An unknown IndexedDB error occurred.";
  return new SaveError(`The architecture could not be saved: ${message}`);
}

function isConstraintError(error: unknown): boolean {
  return error !== null && typeof error === "object" && "name" in error && error.name === "ConstraintError";
}

function randomArchitectureId(): string {
  return createId("arch");
}

async function uniqueArchitectureId(database: Database): Promise<string> {
  while (true) {
    const id = randomArchitectureId();
    if ((await database.getKey(ARCHITECTURES_STORE, id)) === undefined) return id;
  }
}

function requireValidName(name: string): void {
  if (!name.trim()) throw new SaveError("Architecture name is required.");
  if (name.length > 50_000) throw new SaveError("Architecture name is longer than 50000 characters.");
}

function copyName(name: string): string {
  const suffix = " (copy)";
  return `${name.slice(0, 50_000 - suffix.length)}${suffix}`;
}

export async function openRepository(
  databaseName = DATABASE_NAME,
): Promise<Repository & { close(): void; putIfAbsent(file: ArchitectureFile): Promise<boolean> }> {
  let database: IDBPDatabase<SwarmArchitecturerDatabase>;
  try {
    if (typeof indexedDB === "undefined") throw new Error("IndexedDB is not supported.");
    database = await openDatabase(databaseName);
  } catch (error) {
    const message = error instanceof Error ? error.message : "IndexedDB could not be opened.";
    throw new StorageUnavailableError(message);
  }

  const rawRecord = async (id: string): Promise<unknown> =>
    database.get(ARCHITECTURES_STORE, id) as Promise<unknown>;

  const parseStoredRecord = async (raw: unknown): Promise<StoredRecord> => {
    const parsed = parseArchitectureFile(raw);
    if (!parsed.ok) return damagedRecord(raw, parsed.issues);

    const oldVersion =
      raw !== null && typeof raw === "object"
        ? (raw as { schemaVersion?: unknown }).schemaVersion
        : undefined;
    if (oldVersion !== SCHEMA_VERSION) {
      try {
        await database.put(ARCHITECTURES_STORE, parsed.value);
        notifyArchitectureChanged(parsed.value.architecture.id);
      } catch {
        // A migrated view is still usable even if opportunistic rewrite fails.
      }
    }
    return { status: "ok", file: parsed.value };
  };

  const canonicalize = (file: ArchitectureFile): ArchitectureFile => {
    const validationIssues = validateArchitecture(file.architecture);
    if (validationIssues.length > 0) {
      const issue = storageInvariantIssue(validationIssues[0]?.message ?? "unknown validation error");
      throw new SaveError(issue.message, [issue]);
    }
    return toArchitectureFile(file.architecture);
  };

  const save = async (file: ArchitectureFile): Promise<void> => {
    try {
      const canonical = canonicalize(file);
      await database.put(ARCHITECTURES_STORE, canonical);
      notifyArchitectureChanged(canonical.architecture.id);
    } catch (error) {
      if (error instanceof SaveError) throw error;
      throw storageError(error);
    }
  };

  const putIfAbsent = async (file: ArchitectureFile): Promise<boolean> => {
    let canonical: ArchitectureFile;
    try {
      canonical = canonicalize(file);
      await database.add(ARCHITECTURES_STORE, canonical);
    } catch (error) {
      if (isConstraintError(error)) return false;
      if (error instanceof SaveError) throw error;
      throw storageError(error);
    }
    notifyArchitectureChanged(canonical.architecture.id);
    return true;
  };

  const repository: Repository & {
    close(): void;
    putIfAbsent(file: ArchitectureFile): Promise<boolean>;
  } = {
    async list() {
      const records = await database.getAll(ARCHITECTURES_STORE);
      const parsed: StoredRecord[] = [];
      for (const record of records) parsed.push(await parseStoredRecord(record));
      return parsed;
    },

    async get(id) {
      const raw = await rawRecord(id);
      return raw === undefined ? undefined : parseStoredRecord(raw);
    },

    async put(file) {
      await save(file);
    },

    async putIfAbsent(file) {
      return putIfAbsent(file);
    },

    async create(name) {
      requireValidName(name);
      const now = new Date().toISOString();
      let architecture: Architecture = createArchitecture(name, now);
      while (true) {
        const file = toArchitectureFile(architecture);
        if (await putIfAbsent(file)) return file;
        architecture = { ...architecture, id: randomArchitectureId() };
      }
    },

    async duplicate(id) {
      const record = await repository.get(id);
      if (!record) throw new RecordNotFoundError(id);
      if (record.status !== "ok") throw new DamagedRecordError(id);

      const now = new Date().toISOString();
      const architecture: Architecture = {
        ...record.file.architecture,
        id: await uniqueArchitectureId(database),
        name: copyName(record.file.architecture.name),
        createdAt: now,
        updatedAt: now,
      };
      let candidate = architecture;
      while (true) {
        const file = toArchitectureFile(candidate);
        if (await putIfAbsent(file)) return file;
        candidate = { ...candidate, id: await uniqueArchitectureId(database) };
      }
    },

    async rename(id, name) {
      requireValidName(name);
      const record = await repository.get(id);
      if (!record) throw new RecordNotFoundError(id);
      if (record.status !== "ok") throw new DamagedRecordError(id);
      await save(toArchitectureFile({ ...record.file.architecture, name, updatedAt: new Date().toISOString() }));
    },

    async remove(id) {
      await database.delete(ARCHITECTURES_STORE, id);
      notifyArchitectureChanged(id);
    },

    async exists(id) {
      return (await database.getKey(ARCHITECTURES_STORE, id)) !== undefined;
    },

    close() {
      database.close();
    },
  };

  return repository;
}
