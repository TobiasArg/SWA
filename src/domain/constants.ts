import type { ComponentType, Direction, RelationshipType, Size } from "./types";

export const RELATIONSHIP_TYPES: Record<
  RelationshipType,
  { label: string; verb: string; direction: Direction | "configurable" }
> = {
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
};

export function allowedDirections(type: RelationshipType): Direction[] {
  const mode = RELATIONSHIP_TYPES[type].direction;
  return mode === "configurable" ? ["directed", "undirected"] : [mode];
}

export function defaultDirection(type: RelationshipType): Direction {
  const mode = RELATIONSHIP_TYPES[type].direction;
  return mode === "undirected" ? "undirected" : "directed";
}

export const COMPONENT_TYPE_LABELS: Record<ComponentType, string> = {
  agent: "Agent",
  tool: "Tool",
  memory: "Memory / Data Store",
  external_system: "External System",
  decision: "Decision / Routing Rule",
};

export const DEFAULT_COMPONENT_NAMES: Record<ComponentType, string> = {
  agent: "Agent",
  tool: "Tool",
  memory: "Data Store",
  external_system: "External System",
  decision: "Decision",
};

export const DEFAULT_SIZE: Record<ComponentType, Size> = {
  agent: { width: 220, height: 88 },
  tool: { width: 200, height: 72 },
  memory: { width: 200, height: 80 },
  external_system: { width: 220, height: 80 },
  decision: { width: 200, height: 80 },
};

export const MIN_SIZE: Size = { width: 160, height: 56 };
export const MAX_SIZE: Size = { width: 480, height: 320 };

export const GROUP_PADDING = 24;
export const GROUP_HEADER = 32;

export const DUPLICATE_OFFSET = { x: 24, y: 24 } as const;
export const ARROW_NUDGE = 8;
export const ARROW_NUDGE_LARGE = 40;

export const STORE_KINDS = ["memory", "vector", "relational", "file", "other"] as const;
export type StoreKind = (typeof STORE_KINDS)[number];

export const ACCESS_SCOPES = ["shared", "private"] as const;
export type AccessScope = (typeof ACCESS_SCOPES)[number];
