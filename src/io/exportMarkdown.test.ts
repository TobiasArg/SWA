import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Architecture, Component } from "../domain/types";

const downloadMock = vi.hoisted(() => vi.fn());
vi.mock("./download", () => ({ download: downloadMock }));

import {
  architectureMarkdownFilename,
  downloadArchitectureMarkdown,
  exportArchitectureMarkdown,
} from "./exportMarkdown";

const pos = { x: 0, y: 0 };

function component(partial: Partial<Component> & Pick<Component, "id" | "name" | "type">): Component {
  return { position: pos, ...partial };
}

function populated(): Architecture {
  return {
    id: "arch",
    name: "Lead Engine",
    description: "Finds leads.\nSecond line.",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    components: [
      component({
        id: "c-orch",
        type: "agent",
        subtype: "orchestrator",
        name: "Planner",
        description: "Plans work",
        notes: "## Design\n\nVerbatim *notes*.",
        links: [
          { label: "Docs", url: "https://example.com/a(b)" },
          { url: "mailto:a@example.com" },
        ],
        behavior: {
          purpose: "Coordinate",
          role: "Lead",
          responsibilities: ["Plan", "Review"],
          boundaries: ["No writes"],
          activation: "On request",
          rules: ["Be nice"],
          delegation: "To workers",
          outputs: "Plans",
          failureHandling: "Retry",
        },
      }),
      component({
        id: "c-tool",
        type: "tool",
        name: "Search",
        properties: { inputs: "query", outputs: "results", technicalReference: "search()", zeta: "z", alpha: "a" },
      }),
      component({
        id: "c-mem",
        type: "memory",
        name: "Store",
        properties: { storeKind: "vector", accessScope: "shared", contents: "embeddings", accessNotes: "RO" },
      }),
      component({
        id: "c-ext",
        type: "external_system",
        name: "CRM",
        properties: { systemKind: "SaaS", boundaryNotes: "Owned by sales", referenceLink: "https://crm.example.com" },
      }),
      component({
        id: "c-dec",
        type: "decision",
        name: "Router",
        properties: { condition: "score > 3", outcomes: "yes/no" },
      }),
    ],
    groups: [
      {
        id: "g1",
        name: "Core",
        description: "Core parts",
        notes: "Group notes",
        memberComponentIds: ["c-tool", "c-orch"],
        bounds: { x: 0, y: 0, width: 1, height: 1 },
      },
    ],
    relationships: [
      { id: "r1", type: "delegates_to", sourceId: "c-orch", targetId: "c-tool", direction: "directed", label: "plan", description: "Line1\nLine2" },
      { id: "r2", type: "shares_context_with", sourceId: "c-tool", targetId: "c-mem", direction: "undirected" },
    ],
  };
}

describe("exportArchitectureMarkdown", () => {
  it("is deterministic and independent of array order", () => {
    const a = populated();
    const b = populated();
    b.components.reverse();
    b.relationships.reverse();
    b.groups[0]?.memberComponentIds.reverse();
    expect(exportArchitectureMarkdown(a)).toBe(exportArchitectureMarkdown(a));
    expect(exportArchitectureMarkdown(b)).toBe(exportArchitectureMarkdown(a));
    expect(exportArchitectureMarkdown(a).endsWith("\n")).toBe(true);
    expect(exportArchitectureMarkdown(a).endsWith("\n\n")).toBe(false);
  });

  it("renders every populated field", () => {
    const md = exportArchitectureMarkdown(populated());
    for (const text of [
      "# Lead Engine",
      "Finds leads.\nSecond line.",
      "- Components: 5 (Agent: 1, Tool: 1, Memory / Data Store: 1, External System: 1, Decision / Routing Rule: 1)",
      "## Groups",
      "### Core",
      "Core parts",
      "- Planner (Agent)",
      "Group notes",
      "### Ungrouped",
      "- CRM (External System)",
      "**Type:** Agent (Orchestrator)",
      "**Groups:** Core",
      "**Purpose:** Coordinate",
      "**Role:** Lead",
      "**Responsibilities**\n\n- Plan\n- Review",
      "**Boundaries**\n\n- No writes",
      "**Activation:** On request",
      "**Behavioral rules**\n\n- Be nice",
      "**Delegation:** To workers",
      "**Outputs:** Plans",
      "**Failure handling:** Retry",
      "[Docs](<https://example.com/a(b)>)",
      "[mailto:a@example.com](<mailto:a@example.com>)",
      "**Notes**\n\n## Design\n\nVerbatim *notes*.",
      "**Inputs:** query",
      "**Technical reference:** search\\(\\)".replace(/\\\(|\\\)/g, (m) => m.slice(1)),
      "**Store kind:** Vector",
      "**Access scope:** Shared",
      "**Contents:** embeddings",
      "**Access notes:** RO",
      "**System kind:** SaaS",
      "**Boundary / ownership notes:** Owned by sales",
      "**Reference link:** [https://crm\\.example\\.com]".replace(/\\\./g, "."),
      "**Condition:** score > 3".replace(">", "\\>"),
      "**Outcomes:** yes/no",
      "**Planner** → delegates to → **Search**",
      "  - Label: plan",
      "  - Description: Line1\n    Line2",
      "**Search** — shares context with — **Store**",
    ]) {
      expect(md).toContain(text);
    }
    expect(md.indexOf("**alpha:** a")).toBeGreaterThan(md.indexOf("**Technical reference:**"));
    expect(md.indexOf("**zeta:** z")).toBeGreaterThan(md.indexOf("**alpha:** a"));
    expect(md).not.toContain("2026-01-01");
  });

  it("states that relationships are not execution semantics", () => {
    const md = exportArchitectureMarkdown(populated());
    expect(md).toContain("They do not represent execution order, control flow, or data flow.");
  });

  it("omits empty fields and sections", () => {
    const md = exportArchitectureMarkdown({
      id: "a",
      name: "Empty",
      description: "  ",
      createdAt: "",
      updatedAt: "",
      groups: [],
      relationships: [],
      components: [
        component({
          id: "c",
          type: "agent",
          name: "Lone",
          description: "",
          notes: "  \n",
          links: [{ url: " " }],
          properties: { x: "" },
          behavior: { purpose: " ", responsibilities: ["", "  "], rules: [] },
        }),
      ],
    });
    expect(md).toBe(
      ["# Empty", "## Summary\n\n- Components: 1 (Agent: 1)\n- Groups: 0\n- Relationships: 0", "## Components\n\n### Lone\n\n**Type:** Agent"].join(
        "\n\n",
      ) + "\n",
    );
    expect(md).not.toContain("## Groups");
    expect(md).not.toContain("## Relationships");
  });

  it("escapes Markdown and HTML in names and text", () => {
    const arch = populated();
    arch.name = "# Title <b>x</b>\nsecond";
    arch.components[0]!.name = "**bold** [a](b) `c`";
    arch.components[0]!.description = "- item\n# head\n<script>alert(1)</script>";
    const md = exportArchitectureMarkdown(arch);
    expect(md.split("\n")[0]).toBe("# \\# Title \\<b\\>x\\</b\\> second");
    expect(md).toContain("### \\*\\*bold\\*\\* \\[a\\](b) \\`c\\`");
    expect(md).toContain("\\- item\n\\# head\n\\<script\\>alert(1)\\</script\\>");
    expect(md).not.toContain("<script>");
    expect(md).not.toMatch(/^# head/m);
  });

  it("does not emit unsafe links as Markdown links", () => {
    const arch = populated();
    arch.components[0]!.links = [{ label: "Click", url: "javascript:alert(1)" }];
    arch.components[3]!.properties = { referenceLink: "javascript:alert(2)" };
    const md = exportArchitectureMarkdown(arch);
    expect(md).toContain("- Click: `javascript:alert(1)`");
    expect(md).toContain("**Reference link:** `javascript:alert(2)`");
    expect(md).not.toMatch(/\]\(<?javascript/);
  });

  it("closes a code fence left open in notes", () => {
    const arch = populated();
    arch.components[0]!.notes = "Example:\n\n````ts\nconst a = 1;\n```";
    const md = exportArchitectureMarkdown(arch);
    expect(md).toContain("const a = 1;\n```\n````\n");
  });

  it("matches a compact snapshot", () => {
    const md = exportArchitectureMarkdown({
      id: "a",
      name: "Mini",
      createdAt: "",
      updatedAt: "",
      components: [
        component({ id: "1", type: "agent", name: "Boss", subtype: "orchestrator", behavior: { purpose: "Lead" } }),
        component({ id: "2", type: "tool", name: "Hammer", properties: { inputs: "nails" } }),
      ],
      groups: [],
      relationships: [{ id: "r", type: "uses", sourceId: "1", targetId: "2", direction: "directed" }],
    });
    expect(md).toMatchInlineSnapshot(`
      "# Mini

      ## Summary

      - Components: 2 (Agent: 1, Tool: 1)
      - Groups: 0
      - Relationships: 1

      ## Components

      ### Boss

      **Type:** Agent (Orchestrator)

      **Purpose:** Lead

      ### Hammer

      **Type:** Tool

      **Inputs:** nails

      ## Relationships

      > Relationships are semantic documentation of how components relate. They do not represent execution order, control flow, or data flow.

      - **Boss** → uses → **Hammer**
      "
    `);
  });
});

describe("filename and download", () => {
  beforeEach(() => downloadMock.mockClear());

  it("builds a slugged .md filename with fallback", () => {
    expect(architectureMarkdownFilename("My Cool Arch!")).toBe("my-cool-arch.md");
    expect(architectureMarkdownFilename("***")).toBe("architecture.md");
  });

  it("downloads a markdown blob", async () => {
    const arch = populated();
    downloadArchitectureMarkdown(arch);
    expect(downloadMock).toHaveBeenCalledTimes(1);
    const [blob, filename] = downloadMock.mock.calls[0] as [Blob, string];
    expect(filename).toBe("lead-engine.md");
    expect(blob.type).toBe("text/markdown;charset=utf-8");
    expect(await blob.text()).toBe(exportArchitectureMarkdown(arch));
  });
});
