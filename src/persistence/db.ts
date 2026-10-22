import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { ArchitectureFile } from "../domain/types";
import type { SnapshotRecord } from "./snapshots";

export const DATABASE_NAME = "swarm-architecturer";
export const DATABASE_VERSION = 2;
export const ARCHITECTURES_STORE = "architectures";
export const SNAPSHOTS_STORE = "snapshots";

export type DatabaseStatus = "blocked" | "open" | "blocking" | "terminated";

export interface OpenDatabaseOptions {
  /** Reports a blocked open, a resumed/open connection, and connection loss events. */
  onStatus?: (status: DatabaseStatus) => void;
}

export interface SwarmArchitecturerDatabase extends DBSchema {
  architectures: {
    key: string;
    value: ArchitectureFile;
  };
  snapshots: {
    key: string;
    value: SnapshotRecord;
    indexes: {
      byArchitectureCreated: [string, string];
    };
  };
}

function notifyStatus(options: OpenDatabaseOptions, status: DatabaseStatus): void {
  try {
    options.onStatus?.(status);
  } catch {
    // Observers must not interfere with IndexedDB's connection lifecycle.
  }
}

export function openDatabase(
  name = DATABASE_NAME,
  options: OpenDatabaseOptions = {},
): Promise<IDBPDatabase<SwarmArchitecturerDatabase>> {
  let connection: IDBPDatabase<SwarmArchitecturerDatabase> | undefined;
  return openDB<SwarmArchitecturerDatabase>(name, DATABASE_VERSION, {
    upgrade(database, oldVersion) {
      if (!database.objectStoreNames.contains(ARCHITECTURES_STORE)) {
        database.createObjectStore(ARCHITECTURES_STORE, { keyPath: "architecture.id" });
      }
      if (oldVersion < 2 && !database.objectStoreNames.contains(SNAPSHOTS_STORE)) {
        const snapshots = database.createObjectStore(SNAPSHOTS_STORE, { keyPath: "id" });
        snapshots.createIndex("byArchitectureCreated", ["architectureId", "createdAt"]);
      }
    },
    blocked() {
      notifyStatus(options, "blocked");
    },
    blocking() {
      notifyStatus(options, "blocking");
      connection?.close();
    },
    terminated() {
      notifyStatus(options, "terminated");
    },
  }).then((database) => {
    connection = database;
    notifyStatus(options, "open");
    return database;
  });
}
