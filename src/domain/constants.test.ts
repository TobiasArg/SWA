import { describe, expect, it } from "vitest";
import {
  ACCESS_SCOPES,
  ARROW_NUDGE,
  ARROW_NUDGE_LARGE,
  DEFAULT_SIZE,
  DUPLICATE_OFFSET,
  GROUP_HEADER,
  GROUP_PADDING,
  MAX_SIZE,
  MIN_SIZE,
  RELATIONSHIP_TYPES,
  STORE_KINDS,
  allowedDirections,
  defaultDirection,
} from "./constants";

describe("domain constants", () => {
  it("defines every relationship type, display name, semantic verb and direction mode", () => {
    expect(RELATIONSHIP_TYPES).toEqual({
      delegates_to: { label: "Delegates To", verb: "delegates to", direction: "directed" },
      supervises: { label: "Supervises", verb: "supervises", direction: "directed" },
      uses: { label: "Uses", verb: "uses", direction: "directed" },
      reads_from: { label: "Reads From", verb: "reads from", direction: "directed" },
      writes_to: { label: "Writes To", verb: "writes to", direction: "directed" },
      shares_context_with: {
        label: "Shares Context With",
        verb: "shares context with",
        direction: "undirected",
      },
      reports_to: { label: "Reports To", verb: "reports to", direction: "directed" },
      hands_off_to: { label: "Hands Off To", verb: "hands off to", direction: "directed" },
      depends_on: { label: "Depends On", verb: "depends on", direction: "directed" },
      generic: { label: "Generic", verb: "relates to", direction: "configurable" },
    });
  });

  it("allows only each predefined relationship direction and both Generic directions", () => {
    expect(allowedDirections("delegates_to")).toEqual(["directed"]);
    expect(allowedDirections("shares_context_with")).toEqual(["undirected"]);
    expect(allowedDirections("generic")).toEqual(["directed", "undirected"]);
    expect(defaultDirection("delegates_to")).toBe("directed");
    expect(defaultDirection("shares_context_with")).toBe("undirected");
    expect(defaultDirection("generic")).toBe("directed");
  });

  it("keeps the documented component sizes, resize limits and placement values", () => {
    expect(DEFAULT_SIZE).toEqual({
      agent: { width: 220, height: 88 },
      tool: { width: 200, height: 72 },
      memory: { width: 200, height: 80 },
      external_system: { width: 220, height: 80 },
      decision: { width: 200, height: 80 },
    });
    expect(MIN_SIZE).toEqual({ width: 160, height: 56 });
    expect(MAX_SIZE).toEqual({ width: 480, height: 320 });
    expect(GROUP_PADDING).toBe(24);
    expect(GROUP_HEADER).toBe(32);
    expect(DUPLICATE_OFFSET).toEqual({ x: 24, y: 24 });
    expect(ARROW_NUDGE).toBe(8);
    expect(ARROW_NUDGE_LARGE).toBe(40);
    expect(STORE_KINDS).toEqual(["memory", "vector", "relational", "file", "other"]);
    expect(ACCESS_SCOPES).toEqual(["shared", "private"]);
  });
});
