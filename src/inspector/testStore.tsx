// Test double for the WS-A editor store (TD 5.3). It implements only the
// commands the inspector dispatches and records every call so tests can assert
// coalesce keys and blur behavior without depending on the real history.
import { render } from "@testing-library/react";
import { vi } from "vitest";
import { DomainError, type Command } from "../domain/commands";
import { RELATIONSHIP_TYPES } from "../domain/constants";
import type { Architecture, Component, Selection } from "../domain/types";
import { EditorProvider } from "../editor/context";
import type { DispatchResult, EditorState, EditorStore } from "../editor/storeTypes";
import { Inspector, type InspectorActions } from "./Inspector";

function isEmpty(value: unknown): boolean {
  return value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

function patchObject<T extends object>(target: T, patch: object): T {
  const next = { ...target } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (isEmpty(value)) delete next[key];
    else next[key] = value;
  }
  return next as T;
}

function mapComponent(a: Architecture, id: string, fn: (c: Component) => Component): Architecture {
  return { ...a, components: a.components.map((c) => (c.id === id ? fn(c) : c)) };
}

export function reduce(a: Architecture, command: Command): Architecture {
  switch (command.kind) {
    case "updateComponent":
      if ("name" in command.patch && !command.patch.name?.trim()) {
        throw new DomainError("E_NAME_REQUIRED", "Name is required.");
      }
      return mapComponent(a, command.id, (c) => patchObject(c, command.patch));
    case "setComponentProperty":
      return mapComponent(a, command.id, (c) => {
        const properties = patchObject(c.properties ?? {}, { [command.key]: command.value });
        return patchObject(c, { properties: Object.keys(properties).length ? properties : undefined });
      });
    case "updateBehavior":
      return mapComponent(a, command.id, (c) => {
        if (c.type !== "agent") throw new DomainError("E_BEHAVIOR_NOT_ALLOWED", "Not an agent.");
        const behavior = patchObject(c.behavior ?? {}, command.patch);
        return patchObject(c, { behavior: Object.keys(behavior).length ? behavior : undefined });
      });
    case "setSubtype":
      return mapComponent(a, command.id, (c) => patchObject(c, { subtype: command.subtype }));
    case "updateRelationship":
    case "retypeRelationship":
    case "setRelationshipDirection":
    case "reverseRelationship":
      return {
        ...a,
        relationships: a.relationships.map((rel) => {
          if (rel.id !== command.id) return rel;
          if (command.kind === "updateRelationship") return patchObject(rel, command.patch);
          if (command.kind === "retypeRelationship") {
            const mode = RELATIONSHIP_TYPES[command.type].direction;
            return { ...rel, type: command.type, direction: mode === "configurable" ? rel.direction : mode };
          }
          if (rel.type !== "generic") throw new DomainError("E_NOT_GENERIC", "Only generic relationships.");
          if (command.kind === "setRelationshipDirection") return { ...rel, direction: command.direction };
          return { ...rel, sourceId: rel.targetId, targetId: rel.sourceId };
        }),
      };
    case "updateGroup":
      if ("name" in command.patch && !command.patch.name?.trim()) {
        throw new DomainError("E_NAME_REQUIRED", "Name is required.");
      }
      return { ...a, groups: a.groups.map((g) => (g.id === command.id ? patchObject(g, command.patch) : g)) };
    case "assignToGroup":
      return {
        ...a,
        groups: a.groups.map((g) => {
          const kept = g.memberComponentIds.filter((id) => !command.componentIds.includes(id));
          return {
            ...g,
            memberComponentIds: g.id === command.groupId ? [...kept, ...command.componentIds] : kept,
          };
        }),
      };
    default:
      throw new DomainError("E_UNSUPPORTED", `Test store does not implement ${command.kind}.`);
  }
}

export interface TestStore extends EditorStore {
  dispatched: { command: Command; coalesceKey?: string }[];
  breakCount: number;
}

export function createTestStore(architecture: Architecture, selection?: Partial<Selection>): TestStore {
  let state: EditorState = {
    architecture,
    selection: { componentIds: [], relationshipIds: [], groupIds: [], ...selection },
    canUndo: false,
    canRedo: false,
    revision: 0,
    contentRevision: 0,
    historyHeadId: null,
  };
  const listeners = new Set<() => void>();
  const set = (next: Partial<EditorState>) => {
    state = { ...state, ...next };
    listeners.forEach((listener) => listener());
  };

  const store: TestStore = {
    dispatched: [],
    breakCount: 0,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch(command, options): DispatchResult {
      store.dispatched.push({ command, coalesceKey: options?.coalesceKey });
      try {
        set({
          architecture: reduce(state.architecture, command),
          revision: state.revision + 1,
          contentRevision: state.contentRevision + 1,
        });
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error as DomainError };
      }
    },
    undo: vi.fn(),
    undoEntry: vi.fn(() => false),
    redo: vi.fn(),
    breakCoalescing() {
      store.breakCount += 1;
    },
    setSelection: (next) => set({ selection: next }),
    setViewport: vi.fn(),
    renameArchitecture: (name) => set({ architecture: { ...state.architecture, name } }),
    setArchitectureDescription: (description) =>
      set({ architecture: patchObject(state.architecture, { description }) }),
  };
  return store;
}

export function createTestActions(): InspectorActions {
  return {
    deleteSelection: vi.fn(),
    duplicateSelection: vi.fn(),
    groupSelection: vi.fn(),
    openConnectDialog: vi.fn(),
  };
}

export function renderInspector(architecture: Architecture, selection?: Partial<Selection>) {
  const store = createTestStore(architecture, selection);
  const actions = createTestActions();
  const view = render(
    <EditorProvider store={store}>
      <Inspector actions={actions} />
    </EditorProvider>,
  );
  return { ...view, store, actions };
}

export function fixture(): Architecture {
  return {
    id: "arch_1",
    name: "Lead Hunting Engine",
    createdAt: "2026-10-21T00:00:00.000Z",
    updatedAt: "2026-10-21T00:00:00.000Z",
    components: [
      { id: "cmp_orch", type: "agent", subtype: "orchestrator", name: "Coordinator", position: { x: 0, y: 0 } },
      {
        id: "cmp_val",
        type: "agent",
        name: "Validation Agent",
        position: { x: 300, y: 0 },
        behavior: { purpose: "Validate leads", role: "Validator", rules: ["Never guess"] },
      },
      { id: "cmp_disc", type: "agent", name: "Discovery Agent", position: { x: 600, y: 0 } },
      { id: "cmp_tool", type: "tool", name: "Web Search", position: { x: 0, y: 200 } },
      {
        id: "cmp_store",
        type: "memory",
        name: "Shared Lead Store",
        position: { x: 300, y: 200 },
        properties: { storeKind: "vector", futureKey: "kept" },
      },
      { id: "cmp_crm", type: "external_system", name: "CRM", position: { x: 600, y: 200 } },
      { id: "cmp_route", type: "decision", name: "Route", position: { x: 900, y: 200 } },
    ],
    relationships: [
      { id: "rel_reads", type: "reads_from", sourceId: "cmp_val", targetId: "cmp_store", direction: "directed" },
      {
        id: "rel_deleg",
        type: "delegates_to",
        sourceId: "cmp_orch",
        targetId: "cmp_val",
        direction: "directed",
        label: "batches",
      },
      {
        id: "rel_share",
        type: "shares_context_with",
        sourceId: "cmp_val",
        targetId: "cmp_disc",
        direction: "undirected",
      },
      { id: "rel_gen", type: "generic", sourceId: "cmp_disc", targetId: "cmp_crm", direction: "directed" },
    ],
    groups: [
      {
        id: "grp_a",
        name: "Discovery Team",
        memberComponentIds: ["cmp_disc", "cmp_tool"],
        bounds: { x: 0, y: 0, width: 10, height: 10 },
      },
      { id: "grp_b", name: "Empty Group", memberComponentIds: [], bounds: { x: 0, y: 0, width: 10, height: 10 } },
    ],
  };
}
