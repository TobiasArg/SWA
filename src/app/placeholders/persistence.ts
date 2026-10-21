import type { Architecture, ArchitectureFile } from "../../domain/types";
import type { EditorStore } from "../../editor/storeTypes";
import type { Repository, SaveController, SaveStatus, StoredRecord } from "../../persistence/types";

/**
 * Placeholders for `persistence/repository.ts` and `persistence/autosave.ts` (WS-B),
 * also used as the app's test doubles. The repository keeps records in memory only.
 */

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function emptyArchitecture(name: string, now: string, id = newId("arch")): Architecture {
  return { id, name, createdAt: now, updatedAt: now, components: [], relationships: [], groups: [] };
}

export interface MemoryRepository extends Repository {
  /** Test helper: seeds a raw record exactly as `list()`/`get()` should return it. */
  seed(record: StoredRecord): void;
}

export function createMemoryRepository(now: () => string = () => new Date().toISOString()): MemoryRepository {
  const records = new Map<string, StoredRecord>();

  const requireFile = (id: string): ArchitectureFile => {
    const record = records.get(id);
    if (!record || record.status !== "ok") throw new Error(`Architecture ${id} not found.`);
    return record.file;
  };

  const put = (file: ArchitectureFile) => {
    records.set(file.architecture.id, { status: "ok", file: clone(file) });
  };

  return {
    seed(record) {
      records.set(record.status === "ok" ? record.file.architecture.id : record.id, record);
    },
    async list() {
      return [...records.values()].map(clone);
    },
    async get(id) {
      const record = records.get(id);
      return record ? clone(record) : undefined;
    },
    async put(file) {
      put(file);
    },
    async create(name) {
      const file: ArchitectureFile = { schemaVersion: 1, architecture: emptyArchitecture(name, now()) };
      put(file);
      return clone(file);
    },
    async duplicate(id) {
      const source = requireFile(id);
      const timestamp = now();
      const file: ArchitectureFile = {
        schemaVersion: 1,
        architecture: {
          ...clone(source.architecture),
          id: newId("arch"),
          name: `${source.architecture.name} (copy)`,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      };
      put(file);
      return clone(file);
    },
    async rename(id, name) {
      const file = requireFile(id);
      put({ ...file, architecture: { ...file.architecture, name, updatedAt: now() } });
    },
    async remove(id) {
      records.delete(id);
    },
    async exists(id) {
      return records.has(id);
    },
  };
}

export function startPlaceholderAutosave(store: EditorStore, repository: Repository): SaveController {
  let status: SaveStatus = "saved";
  let error: string | undefined;
  let savedRevision = store.getState().revision;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<boolean> | undefined;
  const listeners = new Set<() => void>();

  const setStatus = (next: SaveStatus, message?: string) => {
    status = next;
    error = message;
    listeners.forEach((listener) => listener());
  };

  const save = async (): Promise<boolean> => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (inFlight) await inFlight;
    const { revision, architecture } = store.getState();
    if (revision === savedRevision && status !== "error") return true;
    setStatus("saving");
    inFlight = repository
      .put({ schemaVersion: 1, architecture })
      .then(() => {
        savedRevision = revision;
        setStatus(store.getState().revision === revision ? "saved" : "pending");
        return true;
      })
      .catch((reason: unknown) => {
        setStatus("error", reason instanceof Error ? reason.message : String(reason));
        return false;
      })
      .finally(() => {
        inFlight = undefined;
      });
    return inFlight;
  };

  const unsubscribe = store.subscribe(() => {
    if (store.getState().revision === savedRevision) return;
    if (status !== "saving") setStatus("pending");
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => void save(), 400);
  });

  return {
    getStatus: () => ({ status, error }),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    flush: save,
    retry: () => void save(),
    dispose() {
      unsubscribe();
      if (timer !== undefined) clearTimeout(timer);
      listeners.clear();
    },
  };
}

export function installPlaceholderUnloadGuard(controller: SaveController): () => void {
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (controller.getStatus().status === "saved") return;
    event.preventDefault();
    event.returnValue = "";
  };
  window.addEventListener("beforeunload", onBeforeUnload);
  return () => window.removeEventListener("beforeunload", onBeforeUnload);
}
