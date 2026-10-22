import { describe, expect, it } from "vitest";
import { validArchitectureFixture } from "../domain/validation/__fixtures__/fixtureFactory";
import {
  ARCHITECTURES_STORE,
  DATABASE_VERSION,
  SNAPSHOTS_STORE,
  openDatabase,
} from "./db";

function openRawDatabase(name: string, version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(ARCHITECTURES_STORE)) {
        request.result.createObjectStore(ARCHITECTURES_STORE, { keyPath: "architecture.id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function waitForStatus(statuses: string[], expected: string): Promise<void> {
  if (statuses.includes(expected)) return Promise.resolve();
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (statuses.includes(expected)) {
        clearInterval(interval);
        resolve();
      }
    }, 0);
  });
}

describe("IndexedDB v2", () => {
  it("adds the snapshots store and index without changing raw v1 architecture values", async () => {
    const name = `db-v1-upgrade-${crypto.randomUUID()}`;
    const rawDatabase = await openRawDatabase(name, 1);
    const current = validArchitectureFixture();
    const legacy = structuredClone(current);
    legacy.architecture.id = "arch_legacy_schema";
    const oldest = structuredClone(current);
    oldest.architecture.id = "arch_legacy_shape";
    const values = [
      current,
      { ...legacy, schemaVersion: 1 },
      {
        schemaVersion: 1,
        architecture: {
          ...oldest.architecture,
          description: undefined,
        },
      },
    ];
    const write = rawDatabase.transaction(ARCHITECTURES_STORE, "readwrite");
    for (const value of values) write.objectStore(ARCHITECTURES_STORE).put(value);
    await new Promise<void>((resolve, reject) => {
      write.oncomplete = () => resolve();
      write.onerror = () => reject(write.error);
      write.onabort = () => reject(write.error ?? new Error("Raw v1 seed transaction aborted."));
    });
    rawDatabase.close();

    const upgraded = await openDatabase(name);
    expect(upgraded.version).toBe(DATABASE_VERSION);
    expect(upgraded.objectStoreNames.contains(SNAPSHOTS_STORE)).toBe(true);
    const transaction = upgraded.transaction(SNAPSHOTS_STORE, "readonly");
    expect(transaction.objectStore(SNAPSHOTS_STORE).indexNames.contains("byArchitectureCreated")).toBe(true);
    const after = await upgraded.getAll(ARCHITECTURES_STORE);
    expect(after).toEqual(values);
    upgraded.close();
  });

  it("reports blocked opens and resumes automatically when the older connection closes", async () => {
    const name = `db-blocked-${crypto.randomUUID()}`;
    const oldConnection = await openRawDatabase(name, 1);
    const statuses: string[] = [];
    const opened = openDatabase(name, { onStatus: (status) => statuses.push(status) });
    await waitForStatus(statuses, "blocked");
    expect(statuses).toContain("blocked");

    oldConnection.close();
    const database = await opened;
    expect(statuses).toEqual(["blocked", "open"]);
    expect(database.version).toBe(DATABASE_VERSION);
    database.close();
  });

  it("closes on versionchange, reports blocking, and observes unexpected termination", async () => {
    const name = `db-blocking-${crypto.randomUUID()}`;
    const statuses: string[] = [];
    const database = await openDatabase(name, { onStatus: (status) => statuses.push(status) });
    const request = indexedDB.open(name, DATABASE_VERSION + 1);
    const upgraded = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onupgradeneeded = () => {
        // Keep the newer schema minimal; this connection exists only to trigger versionchange.
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    expect(statuses).toContain("blocking");
    await expect(
      Promise.resolve().then(() => database.put(ARCHITECTURES_STORE, validArchitectureFixture())),
    ).rejects.toBeDefined();

    upgraded.close();
    const terminatedName = `db-terminated-${crypto.randomUUID()}`;
    const latest = await openDatabase(terminatedName, {
      onStatus: (status) => statuses.push(status),
    });
    const closeEvent = {
      type: "close",
      initialized: true,
      dispatched: false,
      eventPath: [],
      bubbles: false,
      propagationStopped: false,
      canceled: false,
      immediatePropagationStopped: false,
      CAPTURING_PHASE: 1,
      AT_TARGET: 2,
      BUBBLING_PHASE: 3,
      NONE: 0,
    } as unknown as Event;
    latest.dispatchEvent(closeEvent);
    expect(statuses).toContain("terminated");
    latest.close();
  });
});
