import type { AccentId } from "./constants";

export const SCHEMA_VERSION = 2 as const;

export interface ArchitectureFile {
  schemaVersion: 2;
  architecture: Architecture;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Architecture {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  components: Component[];
  relationships: Relationship[];
  groups: Group[];
  canvas?: { viewport?: Viewport };
}

export type ComponentType = "agent" | "tool" | "memory" | "external_system" | "decision";

export interface ExternalLink {
  label?: string;
  url: string;
}

export interface Component {
  id: string;
  type: ComponentType;
  subtype?: "orchestrator";
  name: string;
  description?: string;
  notes?: string;
  links?: ExternalLink[];
  position: Position;
  size?: Size;
  /** Presentation only; absent means the type default. Never set on groups. */
  accent?: AccentId;
  properties?: Record<string, string>;
  behavior?: AgentBehavior;
}

export interface AgentBehavior {
  purpose?: string;
  role?: string;
  responsibilities?: string[];
  boundaries?: string[];
  activation?: string;
  rules?: string[];
  delegation?: string;
  outputs?: string;
  failureHandling?: string;
}

export type RelationshipType =
  | "delegates_to"
  | "supervises"
  | "uses"
  | "reads_from"
  | "writes_to"
  | "shares_context_with"
  | "reports_to"
  | "hands_off_to"
  | "depends_on"
  | "generic";

export type Direction = "directed" | "undirected";

export interface Relationship {
  id: string;
  type: RelationshipType;
  sourceId: string;
  targetId: string;
  direction: Direction;
  label?: string;
  description?: string;
  visual?: Record<string, unknown>;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  notes?: string;
  memberComponentIds: string[];
  bounds: Rect;
}

export interface Selection {
  componentIds: string[];
  relationshipIds: string[];
  groupIds: string[];
}
