import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArchitectureFile } from "../domain/types";
import { validArchitectureFixture } from "../domain/validation/__fixtures__/fixtureFactory";
import type { Repository } from "../persistence/types";
import { importArchitectureFile } from "./importJson";
import leadHuntingEngineJson from "../domain/validation/__fixtures__/lead-hunting-engine.json?raw";

function fileContaining(source: string, size = new TextEncoder().encode(source).length): File {
  return { size, text: async () => source } as File;
}

function createRepository(existingIds: string[] = []) {
  const existing = new Set(existingIds);
  const writes: ArchitectureFile[] = [];
  const exists = vi.fn(async (id: string) => existing.has(id));
  const put = vi.fn(async (file: ArchitectureFile) => {
    writes.push(file);
    existing.add(file.architecture.id);
  });
  return {
    repository: { exists, put } as unknown as Repository,
    existing,
    exists,
    put,
    writes,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("JSON architecture import", () => {
  it("validates and imports as a new record with an updated timestamp", async () => {
    const fixture = validArchitectureFixture();
    const store = createRepository();
    const now = "2026-10-21T12:00:00Z";

    const result = await importArchitectureFile(
      fileContaining(JSON.stringify(fixture)),
      store.repository,
      () => now,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.renamed).toBe(false);
      expect(result.file.architecture.id).toBe(fixture.architecture.id);
      expect(result.file.architecture.updatedAt).toBe(now);
      expect(result.file.architecture.createdAt).toBe(fixture.architecture.createdAt);
      expect(result.file.architecture.components.map(({ id }) => id)).toEqual(
        fixture.architecture.components.map(({ id }) => id),
      );
      expect(result.file.architecture.relationships.map(({ id }) => id)).toEqual(
        fixture.architecture.relationships.map(({ id }) => id),
      );
      expect(result.file.architecture.groups.map(({ id }) => id)).toEqual(
        fixture.architecture.groups.map(({ id }) => id),
      );
    }
    expect(store.put).toHaveBeenCalledOnce();
  });

  it("imports the product spec architecture example", async () => {
    const store = createRepository();
    const result = await importArchitectureFile(
      fileContaining(leadHuntingEngineJson),
      store.repository,
      () => "2026-10-21T12:00:00Z",
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.file.architecture.id).toBe("arch_lhe");
      expect(result.file.architecture.components).toHaveLength(4);
    }
    expect(store.put).toHaveBeenCalledOnce();
  });

  it("renames on an architecture ID collision and never overwrites either ID", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
      .mockReturnValueOnce("22222222-2222-4222-8222-222222222222");
    const fixture = validArchitectureFixture();
    const store = createRepository([
      fixture.architecture.id,
      "arch_11111111-1111-4111-8111-111111111111",
    ]);

    const result = await importArchitectureFile(
      fileContaining(JSON.stringify(fixture)),
      store.repository,
      () => "2026-10-21T12:00:00Z",
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.renamed).toBe(true);
      expect(result.file.architecture.id).toBe("arch_22222222-2222-4222-8222-222222222222");
      expect(result.file.architecture.name).toBe("Fixture Architecture (imported)");
      expect(result.file.architecture.components.map(({ id }) => id)).toEqual(
        fixture.architecture.components.map(({ id }) => id),
      );
      expect(result.file.architecture.relationships.map(({ id }) => id)).toEqual(
        fixture.architecture.relationships.map(({ id }) => id),
      );
      expect(result.file.architecture.groups.map(({ id }) => id)).toEqual(
        fixture.architecture.groups.map(({ id }) => id),
      );
    }
    expect(store.put).toHaveBeenCalledOnce();
    expect(store.existing.has(fixture.architecture.id)).toBe(true);
    expect(store.existing.has("arch_11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(store.existing.has("arch_22222222-2222-4222-8222-222222222222")).toBe(true);
  });

  it("retries an insert-only collision that occurs after the initial ID check", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValueOnce("33333333-3333-4333-8333-333333333333")
      .mockReturnValueOnce("44444444-4444-4444-8444-444444444444");
    const fixture = validArchitectureFixture();
    const putIfAbsent = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const exists = vi.fn(async (id: string) => id === "arch_33333333-3333-4333-8333-333333333333");
    const repo = { exists, putIfAbsent } as unknown as Repository;

    const result = await importArchitectureFile(
      fileContaining(JSON.stringify(fixture)),
      repo,
      () => "2026-10-21T12:00:00Z",
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.renamed).toBe(true);
      expect(result.file.architecture.id).toBe("arch_44444444-4444-4444-8444-444444444444");
      expect(result.file.architecture.name).toBe("Fixture Architecture (imported)");
    }
    expect(putIfAbsent).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["malformed JSON", "{"],
    ["unsupported version", JSON.stringify({ schemaVersion: 99, architecture: {} })],
    ["malformed architecture", JSON.stringify({ schemaVersion: 1, architecture: { id: "x" } })],
  ])("writes nothing when import validation fails (%s)", async (_label, source) => {
    const store = createRepository();
    const result = await importArchitectureFile(
      fileContaining(source),
      store.repository,
      () => "2026-10-21T12:00:00Z",
    );

    expect(result.ok).toBe(false);
    expect(store.put).not.toHaveBeenCalled();
    expect(store.exists).not.toHaveBeenCalled();
  });

  it("rejects oversized files before reading and never writes", async () => {
    const store = createRepository();
    const text = vi.fn(async () => JSON.stringify(validArchitectureFixture()));
    const result = await importArchitectureFile(
      { size: 5 * 1024 * 1024 + 1, text } as unknown as File,
      store.repository,
      () => "2026-10-21T12:00:00Z",
    );

    expect(result).toMatchObject({ ok: false, issues: [{ code: "E_FILE_TOO_LARGE" }] });
    expect(text).not.toHaveBeenCalled();
    expect(store.put).not.toHaveBeenCalled();
  });
});
