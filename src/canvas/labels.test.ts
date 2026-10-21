import { describe, expect, it } from "vitest";
import { relationshipDisplayLabel } from "../domain/selectors";
import { componentAriaLabel, componentTypeTag, relationshipCanvasLabel, truncateLabel } from "./labels";
import { buildFixtureArchitecture, makeComponent, makeRelationship } from "./testing/fixtures";

const architecture = buildFixtureArchitecture();

describe("truncateLabel", () => {
  it("keeps short text and truncates long text to 40 characters with an ellipsis", () => {
    expect(truncateLabel("short")).toBe("short");
    const exactly40 = "x".repeat(40);
    expect(truncateLabel(exactly40)).toBe(exactly40);
    const cut = truncateLabel("y".repeat(41));
    expect(Array.from(cut)).toHaveLength(40);
    expect(cut.endsWith("…")).toBe(true);
  });

  it("does not split surrogate pairs", () => {
    const cut = truncateLabel("🙂".repeat(50), 5);
    expect(cut).toBe("🙂🙂🙂🙂…");
  });

  it("keeps the full label separate from the canvas label", () => {
    const rel = architecture.relationships.find((r) => r.id === "rel_generic")!;
    expect(relationshipDisplayLabel(rel)).toBe("syncs routing decisions with the customer relationship manager");
    expect(relationshipCanvasLabel(rel)).toBe("syncs routing decisions with the custom…");
  });
});

describe("relationshipCanvasLabel", () => {
  it("uses the domain display label untruncated when short", () => {
    const rel = makeRelationship({ id: "r", type: "reads_from", sourceId: "a", targetId: "b", label: "lead records" });
    expect(relationshipCanvasLabel(rel)).toBe("reads from · lead records");
    expect(relationshipCanvasLabel({ ...rel, type: "generic", label: undefined })).toBe("relates to");
  });
});

describe("component labels", () => {
  it("builds aria labels with the type display name", () => {
    const orchestrator = architecture.components.find((c) => c.id === "cmp_orch")!;
    expect(componentAriaLabel(orchestrator)).toBe(
      "Orchestrator: Lead Orchestrator. Routes incoming work to the specialist agents.",
    );
    expect(componentAriaLabel(makeComponent({ id: "m", type: "memory", name: "Cache" }))).toBe(
      "Memory / Data Store: Cache.",
    );
  });

  it("provides the uppercase node type tags", () => {
    expect(componentTypeTag({ type: "agent" })).toBe("AGENT");
    expect(componentTypeTag({ type: "agent", subtype: "orchestrator" })).toBe("ORCHESTRATOR");
    expect(componentTypeTag({ type: "tool" })).toBe("TOOL");
    expect(componentTypeTag({ type: "memory" })).toBe("DATA STORE");
    expect(componentTypeTag({ type: "external_system" })).toBe("EXTERNAL");
    expect(componentTypeTag({ type: "decision" })).toBe("DECISION");
  });
});
