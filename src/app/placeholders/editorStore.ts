import { applyCommand, DomainError, type Command, type CommandResult } from "../../domain/commands";
import type { Architecture, Selection, Viewport } from "../../domain/types";
import type { DispatchResult, EditorState, EditorStore } from "../../editor/storeTypes";

/**
 * Placeholder for `editor/store.ts` (WS-A) and the app's test double.
 * Uses the real `applyCommand` and falls back to a minimal local implementation of the
 * commands the shell can trigger without the canvas, while WS-A's operations are stubs.
 */

const EMPTY_SELECTION: Selection = { componentIds: [], relationshipIds: [], groupIds: [] };

function fallbackApply(architecture: Architecture, command: Command): CommandResult {
  switch (command.kind) {
    case "addComponent":
      return { architecture: { ...architecture, components: [...architecture.components, command.component] } };
    case "addRelationship":
      return {
        architecture: { ...architecture, relationships: [...architecture.relationships, command.relationship] },
      };
    case "deleteElements": {
      const componentIds = new Set(command.componentIds);
      const relationshipIds = new Set(command.relationshipIds);
      const groupIds = new Set(command.groupIds);
      const components = architecture.components.filter((c) => !componentIds.has(c.id));
      const relationships = architecture.relationships.filter(
        (r) => !relationshipIds.has(r.id) && !componentIds.has(r.sourceId) && !componentIds.has(r.targetId),
      );
      const groups = architecture.groups
        .filter((g) => !groupIds.has(g.id))
        .map((g) => ({ ...g, memberComponentIds: g.memberComponentIds.filter((id) => !componentIds.has(id)) }));
      return {
        architecture: { ...architecture, components, relationships, groups },
        summary: {
          deletedComponents: architecture.components.length - components.length,
          deletedRelationships: architecture.relationships.length - relationships.length,
          deletedGroups: architecture.groups.length - groups.length,
        },
      };
    }
    default:
      throw new DomainError("E_NOT_IMPLEMENTED", `The ${command.kind} command is not available yet.`);
  }
}

function apply(architecture: Architecture, command: Command): CommandResult {
  try {
    return applyCommand(architecture, command);
  } catch (error) {
    if (error instanceof DomainError && error.code === "E_NOT_IMPLEMENTED") {
      return fallbackApply(architecture, command);
    }
    throw error;
  }
}

function pruneSelection(architecture: Architecture, selection: Selection): Selection {
  const has = (ids: { id: string }[]) => {
    const set = new Set(ids.map((item) => item.id));
    return (id: string) => set.has(id);
  };
  return {
    componentIds: selection.componentIds.filter(has(architecture.components)),
    relationshipIds: selection.relationshipIds.filter(has(architecture.relationships)),
    groupIds: selection.groupIds.filter(has(architecture.groups)),
  };
}

export function createPlaceholderEditorStore(
  initial: Architecture,
  now: () => string = () => new Date().toISOString(),
): EditorStore {
  const past: { before: Architecture; after: Architecture; coalesceKey?: string }[] = [];
  const future: { before: Architecture; after: Architecture }[] = [];
  let openCoalesceKey: string | undefined;
  let state: EditorState = {
    architecture: initial,
    selection: EMPTY_SELECTION,
    canUndo: false,
    canRedo: false,
    revision: 0,
    contentRevision: 0,
  };
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach((listener) => listener());

  const commitContent = (architecture: Architecture) => {
    const next = { ...architecture, updatedAt: now() };
    state = {
      architecture: next,
      selection: pruneSelection(next, state.selection),
      canUndo: past.length > 0,
      canRedo: future.length > 0,
      revision: state.revision + 1,
      contentRevision: state.contentRevision + 1,
    };
    emit();
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch(command, options = {}): DispatchResult {
      let result: CommandResult;
      try {
        result = apply(state.architecture, command);
      } catch (error) {
        const domainError =
          error instanceof DomainError ? error : new DomainError("E_UNKNOWN", String(error));
        return { ok: false, error: domainError };
      }
      const top = past[past.length - 1];
      if (top && options.coalesceKey !== undefined && options.coalesceKey === openCoalesceKey) {
        top.after = result.architecture;
      } else {
        past.push({ before: state.architecture, after: result.architecture, coalesceKey: options.coalesceKey });
        if (past.length > 200) past.shift();
      }
      openCoalesceKey = options.coalesceKey;
      future.length = 0;
      commitContent(result.architecture);
      return { ok: true, summary: result.summary };
    },
    undo() {
      const entry = past.pop();
      if (!entry) return;
      future.push(entry);
      openCoalesceKey = undefined;
      commitContent(entry.before);
    },
    redo() {
      const entry = future.pop();
      if (!entry) return;
      past.push(entry);
      openCoalesceKey = undefined;
      commitContent(entry.after);
    },
    breakCoalescing() {
      openCoalesceKey = undefined;
    },
    setSelection(selection) {
      openCoalesceKey = undefined;
      state = { ...state, selection: pruneSelection(state.architecture, selection) };
      emit();
    },
    setViewport(viewport: Viewport) {
      state = {
        ...state,
        architecture: { ...state.architecture, canvas: { ...state.architecture.canvas, viewport } },
        revision: state.revision + 1,
      };
      emit();
    },
    renameArchitecture(name) {
      const trimmed = name.trim();
      if (!trimmed || trimmed === state.architecture.name) return;
      state = {
        ...state,
        architecture: { ...state.architecture, name: trimmed, updatedAt: now() },
        revision: state.revision + 1,
      };
      emit();
    },
    setArchitectureDescription(description) {
      const next = { ...state.architecture, updatedAt: now() };
      if (description) next.description = description;
      else delete next.description;
      state = { ...state, architecture: next, revision: state.revision + 1 };
      emit();
    },
  };
}
