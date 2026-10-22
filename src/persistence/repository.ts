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
  SNAPSHOTS_STORE,
  openDatabase,
  type DatabaseStatus,
  type OpenDatabaseOptions,
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
  options: OpenDatabaseOptions = {},
): Promise<Repository & { close(): void; putIfAbsent(file: ArchitectureFile): Promise<boolean> }> {
  let database: IDBPDatabase<SwarmArchitecturerDatabase>;
  let connectionFailure: DatabaseStatus | undefined;
  let repositoryClosed = false;
  try {
    if (typeof indexedDB === "undefined") throw new Error("IndexedDB is not supported.");
    database = await openDatabase(databaseName, {
      onStatus(status) {
        if (status === "blocking" || status === "terminated") connectionFailure = status;
        options.onStatus?.(status);
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "IndexedDB could not be opened.";
    throw new StorageUnavailableError(message);
  }

  const assertWritable = (): void => {
    if (repositoryClosed || connectionFailure !== undefined) {
      const message =
        connectionFailure === "blocking"
          ? "The database was updated in another tab. Reload this tab to keep saving."
          : "The local storage connection is closed. Reload this tab to keep saving.";
      throw new SaveError(message);
    }
  };

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
        if (!repositoryClosed && connectionFailure === undefined) {
          await database.put(ARCHITECTURES_STORE, parsed.value);
          notifyArchitectureChanged(parsed.value.architecture.id);
        }
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
      assertWritable();
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
      assertWritable();
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
      assertWritable();
      const transaction = database.transaction([ARCHITECTURES_STORE, SNAPSHOTS_STORE], "readwrite");
      try {
        const architectureStore = transaction.objectStore(ARCHITECTURES_STORE);
        const snapshotsStore = transaction.objectStore(SNAPSHOTS_STORE);
        const architectureDelete = architectureStore.delete(id);
        const snapshotKeysRequest = snapshotsStore.getAllKeys();
        const snapshotValuesRequest = snapshotsStore.getAll();
        const [snapshotKeys, snapshotValues] = await Promise.all([
          snapshotKeysRequest,
          snapshotValuesRequest,
          architectureDelete.then(() => undefined),
        ]);
        const deletes: Promise<unknown>[] = [];
        snapshotValues.forEach((value, index) => {
          const raw = value as unknown;
          const architectureId =
            raw !== null && typeof raw === "object"
              ? (raw as { architectureId?: unknown }).architectureId
              : undefined;
          const key = snapshotKeys[index];
          if (architectureId === id && key !== undefined) deletes.push(snapshotsStore.delete(key));
        });
        await Promise.all([...deletes, transaction.done]);
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          // The transaction may already have completed or been aborted by IndexedDB.
        }
        await transaction.done.catch(() => undefined);
        throw error;
      }
      notifyArchitectureChanged(id);
    },

    async exists(id) {
      return (await database.getKey(ARCHITECTURES_STORE, id)) !== undefined;
    },

    close() {
      repositoryClosed = true;
      database.close();
    },
  };

  return repository;
}
