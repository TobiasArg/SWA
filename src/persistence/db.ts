import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { ArchitectureFile } from "../domain/types";

export const DATABASE_NAME = "swarm-architecturer";
export const DATABASE_VERSION = 1;
export const ARCHITECTURES_STORE = "architectures";

export interface SwarmArchitecturerDatabase extends DBSchema {
  architectures: {
    key: string;
    value: ArchitectureFile;
  };
}

export function openDatabase(name = DATABASE_NAME): Promise<IDBPDatabase<SwarmArchitecturerDatabase>> {
  return openDB<SwarmArchitecturerDatabase>(name, DATABASE_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(ARCHITECTURES_STORE)) {
        database.createObjectStore(ARCHITECTURES_STORE, { keyPath: "architecture.id" });
      }
    },
  });
}
