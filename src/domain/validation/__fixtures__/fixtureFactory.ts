import type { ArchitectureFile } from "../../types";

export function validArchitectureFixture(): ArchitectureFile {
  return {
    schemaVersion: 2,
    architecture: {
      id: "arch_fixture",
      name: "Fixture Architecture",
      createdAt: "2026-10-20T09:00:00Z",
      updatedAt: "2026-10-20T09:30:00Z",
      components: [
        {
          id: "cmp_agent",
          type: "agent",
          name: "Agent One",
          position: { x: 10, y: 20 },
        },
        {
          id: "cmp_tool",
          type: "tool",
          name: "Tool One",
          position: { x: 280, y: 20 },
        },
      ],
      relationships: [
        {
          id: "rel_uses",
          type: "uses",
          sourceId: "cmp_agent",
          targetId: "cmp_tool",
          direction: "directed",
        },
      ],
      groups: [
        {
          id: "grp_one",
          name: "Group One",
          memberComponentIds: ["cmp_tool"],
          bounds: { x: 0, y: 0, width: 10, height: 10 },
        },
      ],
    },
  };
}

export function cloneFixture(): ArchitectureFile {
  return structuredClone(validArchitectureFixture());
}
