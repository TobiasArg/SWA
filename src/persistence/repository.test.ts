import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArchitectureFile } from "../domain/types";
import { validArchitectureFixture } from "../domain/validation/__fixtures__/fixtureFactory";
import { openDatabase } from "./db";
import {
  DamagedRecordError,
  RecordNotFoundError,
  StorageUnavailableError,
  openRepository,
} from "./repository";

type TestRepository = Awaited<ReturnType<typeof openRepository>>;
const openedRepositories: TestRepository[] = [];

async function createRepository(): Promise<TestRepository> {
  const repository = await openRepository(`repository-test-${globalThis.crypto.randomUUID()}`);
  openedRepositories.push(repository);
  return repository;
}

afterEach(() => {
  openedRepositories.splice(0).forEach((repository) => repository.close());
  vi.unstubAllGlobals();
});

describe("IndexedDB architecture repository", () => {
  it("creates, lists, reads, renames, duplicates, and removes architectures", async () => {
    const repository = await createRepository();
    const created = await repository.create("Original Architecture");
    expect(created.architecture.name).toBe("Original Architecture");
    expect(await repository.exists(created.architecture.id)).toBe(true);

    const fixture = validArchitectureFixture();
    await repository.put(fixture);
    const duplicate = await repository.duplicate(fixture.architecture.id);
    expect(duplicate.architecture.id).not.toBe(fixture.architecture.id);
    expect(duplicate.architecture.name).toBe("Fixture Architecture (copy)");
    expect(duplicate.architecture.components.map(({ id }) => id)).toEqual(
      fixture.architecture.components.map(({ id }) => id),
    );
    expect(duplicate.architecture.relationships.map(({ id }) => id)).toEqual(
      fixture.architecture.relationships.map(({ id }) => id),
    );
    expect(duplicate.architecture.groups.map(({ id }) => id)).toEqual(
      fixture.architecture.groups.map(({ id }) => id),
    );

    await repository.rename(created.architecture.id, "Renamed Architecture");
    expect((await repository.get(created.architecture.id))?.status).toBe("ok");
    const renamed = await repository.get(created.architecture.id);
    expect(renamed?.status === "ok" && renamed.file.architecture.name).toBe("Renamed Architecture");
    expect((await repository.list()).filter((record) => record.status === "ok")).toHaveLength(3);

    await repository.remove(created.architecture.id);
    expect(await repository.exists(created.architecture.id)).toBe(false);
    expect(await repository.get(created.architecture.id)).toBeUndefined();
  });

  it("lists invalid stored records as damaged without losing their raw value", async () => {
    const databaseName = `damaged-test-${globalThis.crypto.randomUUID()}`;
    const database = await openDatabase(databaseName);
    const raw = {
      schemaVersion: 99,
      architecture: { id: "arch_damaged", name: "Broken data" },
    } as unknown as ArchitectureFile;
    await database.put("architectures", raw);
    database.close();

    const repository = await openRepository(databaseName);
    openedRepositories.push(repository);
    const result = await repository.get("arch_damaged");
    expect(result).toMatchObject({
      status: "damaged",
      id: "arch_damaged",
      name: "Broken data",
      raw,
    });
    expect((await repository.list())[0]?.status).toBe("damaged");
    await expect(repository.duplicate("arch_damaged")).rejects.toBeInstanceOf(DamagedRecordError);
  });

  it("rejects inconsistent writes before IndexedDB is changed", async () => {
    const repository = await createRepository();
    const invalid = validArchitectureFixture();
    invalid.architecture.relationships[0] = {
      ...invalid.architecture.relationships[0]!,
      targetId: "cmp_missing",
    };

    await expect(repository.put(invalid)).rejects.toMatchObject({
      name: "SaveError",
      issues: [{ code: "E_STORAGE_INVARIANT" }],
    });
    expect(await repository.exists(invalid.architecture.id)).toBe(false);
  });

  it("supports atomic insert-only writes without replacing an existing architecture", async () => {
    const repository = await createRepository();
    const first = validArchitectureFixture();
    expect(await repository.putIfAbsent(first)).toBe(true);

    const replacement = structuredClone(first);
    replacement.architecture.name = "Must not replace the first record";
    expect(await repository.putIfAbsent(replacement)).toBe(false);
    const stored = await repository.get(first.architecture.id);

    expect(stored?.status === "ok" && stored.file.architecture.name).toBe("Fixture Architecture");
  });

  it("opens a stored v1 record unchanged and rewrites it as v2", async () => {
    const databaseName = `v1-test-${globalThis.crypto.randomUUID()}`;
    const database = await openDatabase(databaseName);
    const v1 = { ...validArchitectureFixture(), schemaVersion: 1 };
    await database.put("architectures", v1 as unknown as ArchitectureFile);
    database.close();

    const repository = await openRepository(databaseName);
    openedRepositories.push(repository);
    const result = await repository.get(v1.architecture.id);
    expect(result?.status).toBe("ok");
    if (result?.status !== "ok") return;
    expect(result.file.schemaVersion).toBe(2);
    expect(result.file.architecture.components).toEqual(v1.architecture.components);
    expect(result.file.architecture.relationships).toEqual(v1.architecture.relationships);
    expect(result.file.architecture.name).toBe(v1.architecture.name);

    repository.close();
    openedRepositories.pop();
    const reopened = await openDatabase(databaseName);
    const stored = (await reopened.get("architectures", v1.architecture.id)) as { schemaVersion: number };
    reopened.close();
    expect(stored.schemaVersion).toBe(2);
  });

  it("reports missing records with a repository error", async () => {
    const repository = await createRepository();
    await expect(repository.duplicate("arch_missing")).rejects.toBeInstanceOf(RecordNotFoundError);
  });

  it("wraps an unavailable IndexedDB implementation", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(openRepository()).rejects.toBeInstanceOf(StorageUnavailableError);
  });
});
