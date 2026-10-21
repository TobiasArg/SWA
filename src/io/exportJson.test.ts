import { afterEach, describe, expect, it, vi } from "vitest";
import { validArchitectureFixture } from "../domain/validation/__fixtures__/fixtureFactory";
import {
  architectureJsonFilename,
  downloadArchitectureJson,
  downloadRawArchitectureJson,
  exportArchitectureJson,
  exportRawArchitectureJson,
  rawArchitectureJsonFilename,
  slugifyArchitectureName,
} from "./exportJson";

const createUrlDescriptor = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
const revokeUrlDescriptor = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");

afterEach(() => {
  if (createUrlDescriptor) Object.defineProperty(URL, "createObjectURL", createUrlDescriptor);
  else Reflect.deleteProperty(URL, "createObjectURL");
  if (revokeUrlDescriptor) Object.defineProperty(URL, "revokeObjectURL", revokeUrlDescriptor);
  else Reflect.deleteProperty(URL, "revokeObjectURL");
  vi.useRealTimers();
});

describe("architecture JSON export", () => {
  it("exports canonical JSON with a final newline", () => {
    const architecture = validArchitectureFixture().architecture;
    const json = exportArchitectureJson(architecture);

    expect(json.endsWith("\n")).toBe(true);
    expect(JSON.parse(json)).toMatchObject({
      schemaVersion: 1,
      architecture: { id: architecture.id, name: architecture.name },
    });
  });

  it("creates safe ASCII filenames capped at 60 slug characters", () => {
    expect(slugifyArchitectureName(" Agent / Tool: Data Store ")).toBe("agent-tool-data-store");
    expect(architectureJsonFilename("---")).toBe("architecture.json");
    expect(slugifyArchitectureName("a".repeat(80))).toHaveLength(60);
    expect(rawArchitectureJsonFilename("My Architecture")).toBe("my-architecture-raw.json");
  });

  it("exports damaged raw values without forcing architecture schema", () => {
    const raw = { schemaVersion: 99, architecture: { id: "arch_bad" } };
    expect(JSON.parse(exportRawArchitectureJson(raw))).toEqual(raw);
  });

  it("downloads blobs with a temporary link and revokes the object URL", async () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => "blob:test");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadArchitectureJson(validArchitectureFixture().architecture);

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector("a[download='fixture-architecture.json']")).toBeNull();
    await vi.runAllTimersAsync();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });

  it("uses the raw export suffix when downloading damaged data", async () => {
    vi.useFakeTimers();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:raw") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadRawArchitectureJson({ malformed: true }, "Broken Library Entry");
    await vi.runAllTimersAsync();

    expect(document.querySelector("a[download='broken-library-entry-raw.json']")).toBeNull();
  });
});
