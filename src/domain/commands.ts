import type {
  AgentBehavior,
  Architecture,
  Component,
  Direction,
  Position,
  Relationship,
  RelationshipType,
  Size,
} from "./types";

export type Command =
  | { kind: "addComponent"; component: Component }
  | { kind: "duplicateComponents"; items: { sourceId: string; newId: string }[] }
  | {
      kind: "deleteElements";
      componentIds: string[];
      relationshipIds: string[];
      groupIds: string[];
    }
  | {
      kind: "moveElements";
      componentPositions: Record<string, Position>;
      groupDeltas: Record<string, Position>;
    }
  | { kind: "resizeComponent"; id: string; position: Position; size: Size }
  | {
      kind: "updateComponent";
      id: string;
      patch: Partial<Pick<Component, "name" | "description" | "notes" | "links">>;
    }
  | { kind: "setComponentProperty"; id: string; key: string; value: string | undefined }
  | { kind: "updateBehavior"; id: string; patch: Partial<AgentBehavior> }
  | { kind: "setSubtype"; id: string; subtype: "orchestrator" | undefined }
  | { kind: "addRelationship"; relationship: Relationship }
  | { kind: "updateRelationship"; id: string; patch: { label?: string; description?: string } }
  | { kind: "retypeRelationship"; id: string; type: RelationshipType }
  | { kind: "setRelationshipDirection"; id: string; direction: Direction }
  | { kind: "reverseRelationship"; id: string }
  | { kind: "createGroup"; group: { id: string; name: string }; memberIds: string[] }
  | {
      kind: "updateGroup";
      id: string;
      patch: { name?: string; description?: string; notes?: string };
    }
  | { kind: "assignToGroup"; componentIds: string[]; groupId: string | null };

export interface CommandResult {
  architecture: Architecture;
  summary?: { deletedComponents: number; deletedRelationships: number; deletedGroups: number };
}

export class DomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

export { applyCommand } from "./operations";
