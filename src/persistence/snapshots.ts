import { createId } from "../domain/ids";
import { toArchitectureFile } from "../domain/serialize";
import type { ArchitectureFile } from "../domain/types";
import { parseArchitectureFile } from "../domain/validation";
import { DATABASE_NAME, openDatabase, SNAPSHOTS_STORE, type DatabaseStatus, type OpenDatabaseOptions } from "./db";

export type SnapshotTrigger = "open" | "interval" | "leave" | "manual" | "pre-restore";
export type SnapshotClass = "auto" | "manual" | "recovery";

export interface SnapshotCounts {
  components: number;
  relationships: number;
  groups: number;
}

export interface SnapshotRecord {
  id: string;
  architectureId: string;
  createdAt: string;
  trigger: SnapshotTrigger;
  fingerprint: string;
  counts: SnapshotCounts;
  file: ArchitectureFile;
}

interface SnapshotListMetadata {
  id: string;
  architectureId: string;
  createdAt?: string;
  trigger?: SnapshotTrigger;
  snapshotClass?: SnapshotClass;
  fingerprint?: string;
  counts?: SnapshotCounts;
}

export type SnapshotListItem =
  | (SnapshotListMetadata & {
      status: "ok";
      createdAt: string;
      trigger: SnapshotTrigger;
      snapshotClass: SnapshotClass;
      fingerprint: string;
      counts: SnapshotCounts;
    })
  | (SnapshotListMetadata & {
      status: "damaged";
      message: string;
    });

export type SnapshotGetResult =
  | { status: "ok"; record: SnapshotRecord }
  | { status: "damaged"; id: string }
  | undefined;

export type SnapshotCaptureResult =
  | { status: "created"; id: string }
  | { status: "unchanged"; id: string }
  | { status: "skipped"; reason: "low-storage" };

export interface SnapshotStore {
  /** Newest first. Damaged records are included but cannot be restored. */
  list(architectureId: string): Promise<SnapshotListItem[]>;
  get(id: string): Promise<SnapshotGetResult>;
  capture(file: ArchitectureFile, trigger: SnapshotTrigger): Promise<SnapshotCaptureResult>;
  close(): void;
}

export interface StorageEstimateLike {
  usage?: number;
  quota?: number;
}

export interface SnapshotStoreOptions extends OpenDatabaseOptions {
  /** Injectable to make retention and timestamp behavior deterministic. */
  clock?: () => Date;
  /** Injectable for tests; the browser estimate is used when omitted. */
  estimateStorage?: () => Promise<StorageEstimateLike>;
}

const VALID_TRIGGERS: readonly SnapshotTrigger[] = ["open", "interval", "leave", "manual", "pre-restore"];
const AUTO_TRIGGERS: readonly SnapshotTrigger[] = ["open", "interval", "leave"];
const RETENTION_LIMIT: Record<SnapshotClass, number> = {
  auto: 30,
  manual: 20,
  recovery: 10,
};
const AUTO_RETENTION_MS = 90 * 24 * 60 * 60 * 1_000;
const FNV64_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV64_PRIME = 0x100000001b3n;
const FNV64_MASK = 0xffffffffffffffffn;

type UnknownRecord = Record<string, unknown>;

interface SnapshotRetentionRecord {
  id: string;
  createdAt?: string;
  trigger: SnapshotTrigger;
}

interface SnapshotCandidate {
  id: string;
  raw: unknown;
  createdAt?: string;
}

interface StoredDiagramParts {
  components: unknown[];
  relationships: unknown[];
  groups: unknown[];
}

function isObject(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSnapshotTrigger(value: unknown): value is SnapshotTrigger {
  return typeof value === "string" && VALID_TRIGGERS.includes(value as SnapshotTrigger);
}

function snapshotClass(trigger: SnapshotTrigger): SnapshotClass {
  if (AUTO_TRIGGERS.includes(trigger)) return "auto";
  return trigger === "manual" ? "manual" : "recovery";
}

/** The canonical key intentionally excludes library metadata and the viewport. */
export function diagramKey(file: ArchitectureFile): string {
  const architecture = toArchitectureFile(file.architecture).architecture;
  return JSON.stringify({
    components: architecture.components,
    relationships: architecture.relationships,
    groups: architecture.groups,
  });
}

/** FNV-1a 64-bit over the UTF-8 bytes, returned as 16 lowercase hex digits. */
export function fingerprintDiagramKey(key: string): string {
  let hash = FNV64_OFFSET_BASIS;
  for (const byte of new TextEncoder().encode(key)) {
    hash = ((hash ^ BigInt(byte)) * FNV64_PRIME) & FNV64_MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

function canonicalFile(raw: unknown): ArchitectureFile {
  const parsed = parseArchitectureFile(raw);
  if (!parsed.ok) {
    const error = new Error("The architecture cannot be saved as a version because it is invalid.");
    error.name = "SnapshotCaptureError";
    throw error;
  }
  return toArchitectureFile(parsed.value.architecture);
}

function countsFor(file: ArchitectureFile): SnapshotCounts {
  return {
    components: file.architecture.components.length,
    relationships: file.architecture.relationships.length,
    groups: file.architecture.groups.length,
  };
}

function isCounts(value: unknown): value is SnapshotCounts {
  if (!isObject(value)) return false;
  return [value.components, value.relationships, value.groups].every(
    (count) => typeof count === "number" && Number.isSafeInteger(count) && count >= 0,
  );
}

function countsEqual(left: SnapshotCounts, right: SnapshotCounts): boolean {
  return (
    left.components === right.components &&
    left.relationships === right.relationships &&
    left.groups === right.groups
  );
}

function storedDiagramParts(rawFile: unknown): StoredDiagramParts | undefined {
  if (!isObject(rawFile) || !isObject(rawFile.architecture)) return undefined;
  const { components, relationships, groups } = rawFile.architecture;
  if (!Array.isArray(components) || !Array.isArray(relationships) || !Array.isArray(groups)) return undefined;
  return { components, relationships, groups };
}

function countsForStoredParts(parts: StoredDiagramParts): SnapshotCounts {
  return {
    components: parts.components.length,
    relationships: parts.relationships.length,
    groups: parts.groups.length,
  };
}

function validIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return false;
  try {
    return new Date(milliseconds).toISOString() === value;
  } catch {
    return false;
  }
}

function metadataFor(raw: UnknownRecord, id: string, architectureId: string): SnapshotListMetadata {
  const metadata: SnapshotListMetadata = { id, architectureId };
  if (validIsoDate(raw.createdAt)) metadata.createdAt = raw.createdAt;
  if (isSnapshotTrigger(raw.trigger)) {
    metadata.trigger = raw.trigger;
    metadata.snapshotClass = snapshotClass(raw.trigger);
  }
  if (typeof raw.fingerprint === "string" && /^[0-9a-f]{16}$/.test(raw.fingerprint)) {
    metadata.fingerprint = raw.fingerprint;
  }
  if (isCounts(raw.counts)) metadata.counts = { ...raw.counts };
  return metadata;
}

function parseStoredSnapshot(raw: unknown, expectedId: string): SnapshotRecord | undefined {
  if (!isObject(raw)) return undefined;
  if (
    raw.id !== expectedId ||
    typeof raw.architectureId !== "string" ||
    !validIsoDate(raw.createdAt) ||
    !isSnapshotTrigger(raw.trigger) ||
    typeof raw.fingerprint !== "string" ||
    !/^[0-9a-f]{16}$/.test(raw.fingerprint) ||
    !isCounts(raw.counts)
  ) {
    return undefined;
  }

  const parts = storedDiagramParts(raw.file);
  if (!parts || !countsEqual(raw.counts, countsForStoredParts(parts))) return undefined;
  // The fingerprint belongs to the persisted schema's canonical diagram. Check it
  // before parsing/migration, which may legitimately change the returned diagram.
  const storedKey = JSON.stringify({
    components: parts.components,
    relationships: parts.relationships,
    groups: parts.groups,
  });
  if (fingerprintDiagramKey(storedKey) !== raw.fingerprint) return undefined;

  const parsedFile = parseArchitectureFile(raw.file);
  if (!parsedFile.ok) return undefined;
  const file = toArchitectureFile(parsedFile.value.architecture);
  if (file.architecture.id !== raw.architectureId) return undefined;

  return {
    id: expectedId,
    architectureId: raw.architectureId,
    createdAt: raw.createdAt,
    trigger: raw.trigger,
    fingerprint: fingerprintDiagramKey(diagramKey(file)),
    counts: { ...raw.counts },
    file,
  };
}

function compareNewest(left: SnapshotCandidate, right: SnapshotCandidate): number {
  // Unknown timestamps sort first so a damaged candidate cannot be mistaken for
  // an unchanged latest version. Valid timestamps retain the designed date/id order.
  if (left.createdAt === undefined && right.createdAt !== undefined) return -1;
  if (left.createdAt !== undefined && right.createdAt === undefined) return 1;
  return (right.createdAt ?? "").localeCompare(left.createdAt ?? "") || right.id.localeCompare(left.id);
}

function candidateFor(raw: unknown, architectureId: string): SnapshotCandidate | undefined {
  if (!isObject(raw) || raw.architectureId !== architectureId) return undefined;
  const id = typeof raw.id === "string" ? raw.id : String(raw.id ?? "(unknown)");
  return {
    id,
    raw,
    ...(validIsoDate(raw.createdAt) ? { createdAt: raw.createdAt } : {}),
  };
}

function hasUnindexedArchitectureRecord(all: unknown[], indexed: unknown[], architectureId: string): boolean {
  const indexedIds = new Set(
    indexed
      .filter((record): record is UnknownRecord => isObject(record) && typeof record.id === "string")
      .map((record) => record.id as string),
  );
  return all.some(
    (record) =>
      isObject(record) &&
      record.architectureId === architectureId &&
      (typeof record.id !== "string" || !indexedIds.has(record.id)),
  );
}

function indexedRange(architectureId: string): IDBKeyRange {
  return IDBKeyRange.bound([architectureId, ""], [architectureId, "\uffff"]);
}

function isLowStorageEstimate(estimate: StorageEstimateLike | undefined): boolean {
  return (
    estimate !== undefined &&
    typeof estimate.usage === "number" &&
    typeof estimate.quota === "number" &&
    estimate.quota > 0 &&
    estimate.usage / estimate.quota > 0.8
  );
}

async function browserStorageEstimate(): Promise<StorageEstimateLike | undefined> {
  if (typeof navigator === "undefined" || typeof navigator.storage?.estimate !== "function") return undefined;
  return navigator.storage.estimate();
}

function retentionRecord(raw: unknown, architectureId: string): SnapshotRetentionRecord | undefined {
  if (
    !isObject(raw) ||
    typeof raw.id !== "string" ||
    raw.architectureId !== architectureId ||
    !isSnapshotTrigger(raw.trigger)
  ) {
    return undefined;
  }
  return {
    id: raw.id,
    ...(typeof raw.createdAt === "string" ? { createdAt: raw.createdAt } : {}),
    trigger: raw.trigger,
  };
}

function compareRetentionNewest(left: SnapshotRetentionRecord, right: SnapshotRetentionRecord): number {
  const leftTime = left.createdAt === undefined ? Number.NEGATIVE_INFINITY : Date.parse(left.createdAt);
  const rightTime = right.createdAt === undefined ? Number.NEGATIVE_INFINITY : Date.parse(right.createdAt);
  const leftValue = Number.isFinite(leftTime) ? leftTime : Number.NEGATIVE_INFINITY;
  const rightValue = Number.isFinite(rightTime) ? rightTime : Number.NEGATIVE_INFINITY;
  if (leftValue !== rightValue) return rightValue > leftValue ? 1 : -1;
  return right.id.localeCompare(left.id);
}

function retentionPruneIds(records: SnapshotRetentionRecord[], addedId: string, nowMs: number): string[] {
  const toDelete = new Set<string>();
  const cutoff = nowMs - AUTO_RETENTION_MS;

  for (const record of records) {
    if (snapshotClass(record.trigger) !== "auto" || record.id === addedId) continue;
    const createdAt = record.createdAt === undefined ? Number.NaN : Date.parse(record.createdAt);
    if (Number.isFinite(createdAt) && createdAt < cutoff) toDelete.add(record.id);
  }

  for (const kind of ["auto", "manual", "recovery"] as const) {
    const remaining = records
      .filter((record) => snapshotClass(record.trigger) === kind && !toDelete.has(record.id))
      .sort(compareRetentionNewest);
    const limit = RETENTION_LIMIT[kind];
    const retained = remaining.slice(0, limit);
    if (!retained.some((record) => record.id === addedId)) {
      const added = remaining.find((record) => record.id === addedId);
      if (added) retained[retained.length - 1] = added;
    }
    const keep = new Set(retained.map((record) => record.id));
    for (const record of remaining) {
      if (record.id !== addedId && !keep.has(record.id)) toDelete.add(record.id);
    }
  }

  return [...toDelete];
}

export async function openSnapshotStore(
  databaseName = DATABASE_NAME,
  options: SnapshotStoreOptions = {},
): Promise<SnapshotStore> {
  let writeUnavailable: DatabaseStatus | undefined;
  let closed = false;
  const database = await openDatabase(databaseName, {
    onStatus(status) {
      if (status === "blocking" || status === "terminated") writeUnavailable = status;
      options.onStatus?.(status);
    },
  });
  const clock = options.clock ?? (() => new Date());

  const assertWritable = (): void => {
    if (closed || writeUnavailable !== undefined) {
      const message =
        writeUnavailable === "blocking"
          ? "The database was updated in another tab. Reload this tab to keep saving."
          : "The local storage connection is closed. Reload this tab to keep saving.";
      const error = new Error(message);
      error.name = "SnapshotStoreClosedError";
      throw error;
    }
  };

  const store: SnapshotStore = {
    async list(architectureId) {
      const rawRecords: unknown[] = await database.getAll(SNAPSHOTS_STORE);
      return rawRecords
        .filter((raw) => isObject(raw) && raw.architectureId === architectureId)
        .map((raw) => {
          const value = raw as UnknownRecord;
          const id = typeof value.id === "string" ? value.id : String(value.id ?? "(unknown)");
          const metadata = metadataFor(value, id, architectureId);
          const record = parseStoredSnapshot(value, id);
          return record
            ? {
                ...metadata,
                status: "ok" as const,
                createdAt: record.createdAt,
                trigger: record.trigger,
                snapshotClass: snapshotClass(record.trigger),
                fingerprint: record.fingerprint,
                counts: record.counts,
              }
            : {
                ...metadata,
                status: "damaged" as const,
                message: "This version is damaged and can't be restored.",
              };
        })
        .sort((left, right) => {
          const byDate = (right.createdAt ?? "").localeCompare(left.createdAt ?? "");
          return byDate || right.id.localeCompare(left.id);
        });
    },

    async get(id) {
      const raw: unknown = await database.get(SNAPSHOTS_STORE, id);
      if (raw === undefined) return undefined;
      const record = parseStoredSnapshot(raw, id);
      return record ? { status: "ok", record } : { status: "damaged", id };
    },

    async capture(file, trigger) {
      if (!isSnapshotTrigger(trigger)) throw new Error("Unknown snapshot trigger.");
      assertWritable();
      const canonical = canonicalFile(file);
      const newKey = diagramKey(canonical);
      const fingerprint = fingerprintDiagramKey(newKey);
      const autoCapture = AUTO_TRIGGERS.includes(trigger);
      if (autoCapture) {
        try {
          const estimate = await (options.estimateStorage ?? browserStorageEstimate)();
          if (isLowStorageEstimate(estimate)) return { status: "skipped", reason: "low-storage" };
        } catch {
          // An unavailable quota estimate is not evidence that storage is low.
        }
      }
      assertWritable();

      const now = clock();
      const createdAt = now.toISOString();
      const id = createId("snap");
      const counts = countsFor(canonical);
      const newRecord: SnapshotRecord = {
        id,
        architectureId: canonical.architecture.id,
        createdAt,
        trigger,
        fingerprint,
        counts,
        file: canonical,
      };
      const transaction = database.transaction(SNAPSHOTS_STORE, "readwrite");
      try {
        const indexed = transaction.store.index("byArchitectureCreated");
        const existing = await indexed.getAll(indexedRange(newRecord.architectureId));
        const latest = existing
          .map((record) => candidateFor(record, newRecord.architectureId))
          .filter((record): record is SnapshotCandidate => record !== undefined)
          .sort(compareNewest)[0];
        if (latest) {
          const parsedLatest = parseStoredSnapshot(latest.raw, latest.id);
          if (
            parsedLatest &&
            parsedLatest.fingerprint === fingerprint &&
            diagramKey(parsedLatest.file) === newKey
          ) {
            const allExisting: unknown[] = await transaction.store.getAll();
            if (!hasUnindexedArchitectureRecord(allExisting, existing, newRecord.architectureId)) {
              await transaction.done;
              return { status: "unchanged", id: parsedLatest.id };
            }
          }
        }

        await transaction.store.add(newRecord);
        // Store scans also include damaged rows missing a valid createdAt index key,
        // so they participate in class caps and age pruning instead of becoming orphans.
        const afterAdd: unknown[] = await transaction.store.getAll();
        const retentionRecords = afterAdd
          .map((record) => retentionRecord(record, newRecord.architectureId))
          .filter((record): record is SnapshotRetentionRecord => record !== undefined);
        const pruneIds = retentionPruneIds(retentionRecords, id, now.getTime());
        await Promise.all(pruneIds.map((pruneId) => transaction.store.delete(pruneId)));
        await transaction.done;
        return { status: "created", id };
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          // The transaction may already have completed or been aborted by IndexedDB.
        }
        await transaction.done.catch(() => undefined);
        throw error;
      }
    },

    close() {
      closed = true;
      database.close();
    },
  };

  return store;
}
