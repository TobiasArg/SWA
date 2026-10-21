import { describe, expect, it } from "vitest";
import { ACCENT_IDS } from "../constants";
import type { ArchitectureFile, Component, Relationship } from "../types";
import { parseArchitectureFile } from "./index";
import { cloneFixture, validArchitectureFixture } from "./__fixtures__/fixtureFactory";
import leadHuntingEngineJson from "./__fixtures__/lead-hunting-engine.json?raw";

function fixtureWith(update: (file: ArchitectureFile) => void): unknown {
  const file = cloneFixture();
  update(file);
  return file;
}

function firstIssueCode(raw: unknown): string | undefined {
  const result = parseArchitectureFile(raw);
  return result.ok ? undefined : result.issues[0]?.code;
}

describe("architecture file validation", () => {
  it("accepts the product spec 12.4 example and normalizes group bounds", () => {
    const raw = JSON.parse(leadHuntingEngineJson) as unknown;
    const result = parseArchitectureFile(raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.architecture.id).toBe("arch_lhe");
      expect(result.value.architecture.components).toHaveLength(4);
      expect(result.value.architecture.groups[0]?.bounds).not.toEqual({
        x: 160,
        y: 240,
        width: 480,
        height: 140,
      });
    }
  });

  it("strips unknown object fields but preserves arbitrary component properties and relationship visual data", () => {
    const file = fixtureWith((value) => {
      const component = value.architecture.components[0]!;
      Object.assign(component, {
        futureField: "discard me",
        properties: { customKey: "preserve me" },
      });
      const relationship = value.architecture.relationships[0]!;
      Object.assign(relationship, {
        futureField: "discard me",
        visual: { strokeWidth: 4, custom: { enabled: true } },
      });
      Object.assign(value.architecture, { futureArchitectureField: "discard me" });
    });
    const result = parseArchitectureFile(file);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.architecture).not.toHaveProperty("futureArchitectureField");
      expect(result.value.architecture.components[0]).not.toHaveProperty("futureField");
      expect(result.value.architecture.components[0]?.properties).toEqual({ customKey: "preserve me" });
      expect(result.value.architecture.relationships[0]?.visual).toEqual({
        strokeWidth: 4,
        custom: { enabled: true },
      });
      expect(result.value.architecture.relationships[0]).not.toHaveProperty("futureField");
    }
  });

  it.each([
    ["E_NOT_ARCHITECTURE_FILE", null],
    ["E_NOT_ARCHITECTURE_FILE", { schemaVersion: 1 }],
    ["E_SCHEMA_VERSION_MISSING", { architecture: {} }],
    ["E_SCHEMA_VERSION_MISSING", { schemaVersion: "1", architecture: {} }],
    ["E_SCHEMA_VERSION_UNSUPPORTED", { schemaVersion: 3, architecture: {} }],
    ["E_SCHEMA_VERSION_UNSUPPORTED", { schemaVersion: 0, architecture: {} }],
    ["E_SCHEMA_VERSION_UNSUPPORTED", { schemaVersion: 1.5, architecture: {} }],
  ])("reports file/version issue %s", (expectedCode, raw) => {
    expect(firstIssueCode(raw)).toBe(expectedCode);
  });

  it("collects shape errors with schema paths", () => {
    const result = parseArchitectureFile(
      fixtureWith((file) => {
        file.architecture.name = "  ";
        file.architecture.components[0]!.position.x = Number.POSITIVE_INFINITY;
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toEqual(["E_SHAPE", "E_SHAPE"]);
      expect(result.issues[0]?.message).toBe(
        "architecture.name: expected a non-empty text value.",
      );
      expect(result.issues[1]?.path).toBe("architecture.components[0].position.x");
    }
  });

  it.each([
    ["E_DUPLICATE_ID", (file: ArchitectureFile) => {
      file.architecture.components[1] = {
        ...file.architecture.components[1]!,
        id: file.architecture.components[0]!.id,
      };
    }],
    ["E_DANGLING_RELATIONSHIP", (file: ArchitectureFile) => {
      file.architecture.relationships[0] = {
        ...file.architecture.relationships[0]!,
        targetId: "cmp_missing",
      };
    }],
    ["E_GROUP_AS_ENDPOINT", (file: ArchitectureFile) => {
      file.architecture.relationships[0] = {
        ...file.architecture.relationships[0]!,
        targetId: "grp_one",
      };
    }],
    ["E_SELF_RELATIONSHIP", (file: ArchitectureFile) => {
      file.architecture.relationships[0] = {
        ...file.architecture.relationships[0]!,
        targetId: "cmp_agent",
      };
    }],
    ["E_INVALID_DIRECTION", (file: ArchitectureFile) => {
      file.architecture.relationships[0] = {
        ...file.architecture.relationships[0]!,
        type: "shares_context_with",
      } as Relationship;
    }],
    ["E_INVALID_ACCENT", (file: ArchitectureFile) => {
      file.architecture.components[0] = {
        ...file.architecture.components[0]!,
        accent: "chartreuse",
      } as unknown as Component;
    }],
    ["E_INVALID_SUBTYPE", (file: ArchitectureFile) => {
      file.architecture.components[0] = {
        ...file.architecture.components[0]!,
        subtype: "worker",
      } as unknown as Component;
    }],
    ["E_BEHAVIOR_NOT_ALLOWED", (file: ArchitectureFile) => {
      file.architecture.components[1] = {
        ...file.architecture.components[1]!,
        behavior: { purpose: "not allowed" },
      } as unknown as Component;
    }],
    ["E_INVALID_PROPERTY_VALUE", (file: ArchitectureFile) => {
      file.architecture.components[1] = {
        ...file.architecture.components[1]!,
        properties: { storeKind: "graph" },
      };
    }],
    ["E_UNKNOWN_MEMBER", (file: ArchitectureFile) => {
      file.architecture.groups[0] = {
        ...file.architecture.groups[0]!,
        memberComponentIds: ["cmp_missing"],
      };
    }],
    ["E_GROUP_AS_MEMBER", (file: ArchitectureFile) => {
      file.architecture.groups[0] = {
        ...file.architecture.groups[0]!,
        memberComponentIds: ["grp_one"],
      };
    }],
    ["E_MULTIPLE_MEMBERSHIP", (file: ArchitectureFile) => {
      file.architecture.groups.push({
        ...file.architecture.groups[0]!,
        id: "grp_two",
        name: "Group Two",
      });
    }],
  ])("reports semantic issue %s", (expectedCode, update) => {
    const raw = fixtureWith(update as (file: ArchitectureFile) => void);
    expect(firstIssueCode(raw)).toBe(expectedCode);
  });

  it("enforces record count and string length caps as limit issues", () => {
    const tooMany = fixtureWith((file) => {
      file.architecture.components = Array.from({ length: 1_001 }, (_, index) => ({
        id: `cmp_${index}`,
        type: "agent",
        name: `Agent ${index}`,
        position: { x: 0, y: 0 },
      })) as ArchitectureFile["architecture"]["components"];
    });
    const tooLong = fixtureWith((file) => {
      file.architecture.description = "x".repeat(50_001);
    });

    expect(firstIssueCode(tooMany)).toBe("E_LIMIT_EXCEEDED");
    expect(firstIssueCode(tooLong)).toBe("E_LIMIT_EXCEEDED");
  });

  it("does not mutate accepted input", () => {
    const file = validArchitectureFixture();
    const before = structuredClone(file);
    parseArchitectureFile(file);
    expect(file).toEqual(before);
  });

  it("reports the accent message with the allowed ids", () => {
    const result = parseArchitectureFile(
      fixtureWith((file) => {
        Object.assign(file.architecture.components[0]!, { accent: "chartreuse" });
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.message).toBe(
        `Component cmp_agent: accent must be one of ${ACCENT_IDS.join(", ")}.`,
      );
    }
  });

  it("accepts every accent id and strips an accent key from groups", () => {
    const file = cloneFixture();
    file.architecture.components.forEach((component, index) => {
      component.accent = ACCENT_IDS[index];
    });
    Object.assign(file.architecture.groups[0]!, { accent: "teal" });
    const result = parseArchitectureFile(file);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.architecture.components.map((c) => c.accent)).toEqual(["tomato", "coral"]);
      expect(result.value.architecture.groups[0]).not.toHaveProperty("accent");
    }
  });

  it("preserves malformed relationship visual.ports verbatim", () => {
    const visual = { ports: { source: "north", target: 7, extra: [1] }, other: true };
    const result = parseArchitectureFile(
      fixtureWith((file) => {
        file.architecture.relationships[0]!.visual = visual;
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.architecture.relationships[0]?.visual).toEqual(visual);
  });

  it("migrates a v1 file to v2 without changing content, and rejects v3", () => {
    const v1 = JSON.parse(leadHuntingEngineJson) as { schemaVersion: number; architecture: unknown };
    expect(v1.schemaVersion).toBe(1);
    const migrated = parseArchitectureFile(v1);
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    expect(migrated.value.schemaVersion).toBe(2);
    const v2 = parseArchitectureFile({ ...v1, schemaVersion: 2 });
    expect(v2.ok).toBe(true);
    if (v2.ok) expect(v2.value).toEqual(migrated.value);
    expect(migrated.value.architecture.components).toHaveLength(4);
    expect(firstIssueCode({ ...v1, schemaVersion: 3 })).toBe("E_SCHEMA_VERSION_UNSUPPORTED");
  });
});
