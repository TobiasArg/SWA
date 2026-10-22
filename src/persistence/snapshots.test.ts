import { afterEach, describe, expect, it, vi } from "vitest";
import { toArchitectureFile } from "../domain/serialize";
import type { ArchitectureFile } from "../domain/types";
import { validArchitectureFixture } from "../domain/validation/__fixtures__/fixtureFactory";
import { openDatabase } from "./db";
import {
  diagramKey,
  fingerprintDiagramKey,
  openSnapshotStore,
  type SnapshotStore,
} from "./snapshots";

const openedStores: SnapshotStore[] = [];

async function createSnapshotStore(
  options: Parameters<typeof openSnapshotStore>[1] = {},
): Promise<SnapshotStore> {
  const store = await openSnapshotStore(`snapshot-test-${crypto.randomUUID()}`, options);
  openedStores.push(store);
  return store;
}

function versionFile(version: number): ArchitectureFile {
  const file = validArchitectureFixture();
  file.architecture.components[0]!.description = `Diagram version ${version}`;
  return file;
}

afterEach(() => {
  openedStores.splice(0).forEach((store) => store.close());
  vi.restoreAllMocks();
});

describe("snapshot persistence", () => {
  it("deduplicates canonical diagram content while ignoring metadata and viewport changes", async () => {
    const store = await createSnapshotStore({ clock: () => new Date("2026-10-22T12:00:00.000Z") });
    const original = validArchitectureFixture();
    const created = await store.capture(original, "open");
    expect(created.status).toBe("created");
    if (created.status !== "created") return;

    const metadataOnly = structuredClone(original);
    metadataOnly.architecture.name = "A different library name";
    metadataOnly.architecture.description = "Description is metadata, not diagram content.";
    metadataOnly.architecture.updatedAt = "2026-10-22T11:59:00.000Z";
    metadataOnly.architecture.canvas = { viewport: { x: 98, y: -23, zoom: 1.4 } };
    const unchanged = await store.capture(metadataOnly, "manual");
    expect(unchanged).toEqual({ status: "unchanged", id: created.id });

    const changedDiagram = structuredClone(metadataOnly);
    changedDiagram.architecture.components[0]!.position.x += 1;
    const changed = await store.capture(changedDiagram, "manual");
    expect(changed.status).toBe("created");
    if (changed.status !== "created") return;

    const result = await store.get(changed.id);
    expect(result?.status).toBe("ok");
    if (result?.status !== "ok") return;
    expect(result.record.id).toMatch(/^snap_/);
    expect(result.record.file.schemaVersion).toBe(2);
    expect(result.record.counts).toEqual({ components: 2, relationships: 1, groups: 1 });
    expect(result.record.fingerprint).toBe(fingerprintDiagramKey(diagramKey(changedDiagram)));
    expect(result.record.file.architecture.name).toBe("A different library name");
    expect(result.record.file.architecture.canvas?.viewport).toEqual({ x: 98, y: -23, zoom: 1.4 });
  });

  it("uses FNV-1a 64-bit fingerprints and serializes concurrent duplicate captures", async () => {
    expect(fingerprintDiagramKey("hello")).toBe("a430d84680aabd0b");
    const store = await createSnapshotStore();
    const file = versionFile(1);
    const results = await Promise.all([store.capture(file, "manual"), store.capture(file, "pre-restore")]);

    expect(results.filter((result) => result.status === "created")).toHaveLength(1);
    expect(results.filter((result) => result.status === "unchanged")).toHaveLength(1);
    expect(await store.list(file.architecture.id)).toHaveLength(1);
  });

  it("checks the stored diagram fingerprint before applying file schema migrations", async () => {
    const name = `snapshot-schema-migration-${crypto.randomUUID()}`;
    const store = await openSnapshotStore(name);
    openedStores.push(store);
    const currentFile = toArchitectureFile(validArchitectureFixture().architecture);
    const legacyFile = {
      ...structuredClone(currentFile),
      schemaVersion: 1,
    } as unknown as ArchitectureFile;
    const storedKey = diagramKey(currentFile);
    const database = await openDatabase(name);
    await database.put("snapshots", {
      id: "snap_legacy_schema",
      architectureId: currentFile.architecture.id,
      createdAt: "2025-01-01T00:00:00.000Z",
      trigger: "manual",
      fingerprint: fingerprintDiagramKey(storedKey),
      counts: { components: 2, relationships: 1, groups: 1 },
      file: legacyFile,
    });
    database.close();

    const result = await store.get("snap_legacy_schema");
    expect(result?.status).toBe("ok");
    if (result?.status !== "ok") return;
    expect(result.record.file.schemaVersion).toBe(2);
    expect(result.record.fingerprint).toBe(fingerprintDiagramKey(storedKey));
    expect(result.record.fingerprint).toBe(fingerprintDiagramKey(diagramKey(result.record.file)));
  });

  it("enforces per-class caps and expires automatic versions older than 90 days", async () => {
    let now = Date.parse("2025-01-01T00:00:00.000Z");
    const store = await createSnapshotStore({
      clock: () => new Date(now),
      estimateStorage: async () => ({ usage: 0, quota: 100 }),
    });

    for (let index = 0; index < 31; index += 1) {
      now += 1_000;
      await store.capture(versionFile(index), "interval");
    }
    expect((await store.list("arch_fixture")).filter((item) => item.snapshotClass === "auto")).toHaveLength(30);

    now += 91 * 24 * 60 * 60 * 1_000;
    await store.capture(versionFile(31), "open");
    expect((await store.list("arch_fixture")).filter((item) => item.snapshotClass === "auto")).toHaveLength(1);

    for (let index = 32; index < 53; index += 1) {
      now += 1_000;
      await store.capture(versionFile(index), "manual");
    }
    for (let index = 53; index < 64; index += 1) {
      now += 1_000;
      await store.capture(versionFile(index), "pre-restore");
    }

    const versions = await store.list("arch_fixture");
    expect(versions.filter((item) => item.snapshotClass === "auto")).toHaveLength(1);
    expect(versions.filter((item) => item.snapshotClass === "manual")).toHaveLength(20);
    expect(versions.filter((item) => item.snapshotClass === "recovery")).toHaveLength(10);
    expect(versions).toHaveLength(31);
  }, 20_000);

  it("skips automatic captures above 80% quota but still attempts manual and recovery captures", async () => {
    const store = await createSnapshotStore({
      estimateStorage: async () => ({ usage: 81, quota: 100 }),
    });
    expect(await store.capture(versionFile(1), "open")).toEqual({ status: "skipped", reason: "low-storage" });

    const manual = await store.capture(versionFile(2), "manual");
    expect(manual.status).toBe("created");
    const recovery = await store.capture(versionFile(3), "pre-restore");
    expect(recovery.status).toBe("created");
    expect(await store.list("arch_fixture")).toHaveLength(2);
  });

  it("lists damaged records with safe metadata and refuses to return them for restore", async () => {
    const name = `snapshot-damaged-${crypto.randomUUID()}`;
    const store = await openSnapshotStore(name);
    openedStores.push(store);
    const database = await openDatabase(name);
    const damaged = {
      id: "snap_damaged",
      architectureId: "arch_fixture",
      createdAt: "2000-01-01T00:00:00.000Z",
      trigger: "manual",
      fingerprint: "0000000000000000",
      counts: { components: 7, relationships: 3, groups: 2 },
      file: { schemaVersion: 99, architecture: {} },
    };
    await database.put("snapshots", damaged as never);
    database.close();

    const listed = await store.list("arch_fixture");
    expect(listed).toEqual([
      expect.objectContaining({
        status: "damaged",
        id: "snap_damaged",
        architectureId: "arch_fixture",
        trigger: "manual",
        snapshotClass: "manual",
        counts: { components: 7, relationships: 3, groups: 2 },
        message: "This version is damaged and can't be restored.",
      }),
    ]);
    expect(await store.get("snap_damaged")).toEqual({ status: "damaged", id: "snap_damaged" });

    for (let index = 0; index < 20; index += 1) {
      await store.capture(versionFile(index), "manual");
    }
    expect(await store.get("snap_damaged")).toBeUndefined();
    expect(await store.list("arch_fixture")).toHaveLength(20);
  });

  it("captures safely beside malformed indexed and unindexed damaged rows", async () => {
    const name = `snapshot-malformed-index-${crypto.randomUUID()}`;
    const store = await openSnapshotStore(name, {
      estimateStorage: async () => ({ usage: 0, quota: 100 }),
    });
    openedStores.push(store);
    const file = versionFile(100);
    const initial = await store.capture(file, "manual");
    expect(initial.status).toBe("created");

    const database = await openDatabase(name);
    const damagedBase = {
      architectureId: "arch_fixture",
      trigger: "manual",
      fingerprint: "0000000000000000",
      counts: { components: 2, relationships: 1, groups: 1 },
      file: { ...structuredClone(file), schemaVersion: 99 },
    };
    const unindexedDamagedRecords = [
      { ...damagedBase, id: "snap_bad_number_date", createdAt: 123 },
      { ...damagedBase, id: "snap_bad_array_date", createdAt: ["invalid"] },
      { ...damagedBase, id: "snap_bad_missing_date" },
    ];
    for (const record of unindexedDamagedRecords) await database.put("snapshots", record as never);
    database.close();

    // An otherwise matching healthy latest item must not hide unindexed damaged rows.
    const repeat = await store.capture(file, "manual");
    expect(repeat.status).toBe("created");

    const stringDateDatabase = await openDatabase(name);
    const indexedDamagedRecord = {
      ...damagedBase,
      id: "snap_bad_string_date",
      createdAt: "not-an-iso-date",
    };
    await stringDateDatabase.put("snapshots", indexedDamagedRecord as never);
    stringDateDatabase.close();

    // A malformed string date is inside the index range, but cannot break newest sorting.
    const damagedLatestRepeat = await store.capture(file, "manual");
    expect(damagedLatestRepeat.status).toBe("created");
    const automatic = await store.capture(versionFile(101), "open");
    expect(automatic.status).toBe("created");

    const listed = await store.list("arch_fixture");
    const damagedIds = listed.filter((item) => item.status === "damaged").map((item) => item.id);
    const damagedRecords = [...unindexedDamagedRecords, indexedDamagedRecord];
    expect(damagedIds).toEqual(
      expect.arrayContaining(damagedRecords.map(({ id }) => id)),
    );

    for (let index = 0; index < 18; index += 1) {
      await store.capture(versionFile(200 + index), "manual");
    }
    for (const { id } of damagedRecords) expect(await store.get(id)).toBeUndefined();
  });

  it("rolls back the added version and retention deletion together if pruning aborts", async () => {
    let now = Date.parse("2026-10-22T12:00:00.000Z");
    const store = await createSnapshotStore({ clock: () => new Date(now) });
    for (let index = 0; index < 20; index += 1) {
      now += 1_000;
      await store.capture(versionFile(index), "manual");
    }
    const before = await store.list("arch_fixture");
    const originalDelete = IDBObjectStore.prototype.delete;
    const deleteSpy = vi.spyOn(IDBObjectStore.prototype, "delete").mockImplementation(function (
      this: IDBObjectStore,
      key: IDBValidKey | IDBKeyRange,
    ) {
      const request = originalDelete.call(this, key);
      if (this.name === "snapshots") {
        request.addEventListener(
          "success",
          () => {
            try {
              this.transaction.abort();
            } catch {
              // The request could already have aborted the transaction.
            }
          },
          { once: true },
        );
      }
      return request;
    });

    now += 1_000;
    await expect(store.capture(versionFile(20), "manual")).rejects.toBeDefined();
    deleteSpy.mockRestore();

    const after = await store.list("arch_fixture");
    expect(after).toHaveLength(20);
    expect(after.map(({ id }) => id).sort()).toEqual(before.map(({ id }) => id).sort());
  });
});
