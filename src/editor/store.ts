import { DEFAULT_COMMAND_LABELS } from "./commandLabels";
import { applyCommand, DomainError } from "../domain/commands";
import { breakCoalescing, createHistory, head, push, redo as redoHistory, undo as undoHistory } from "../history/history";
import type { Architecture, Selection, Viewport } from "../domain/types";
import type { DispatchResult, EditorState, EditorStore } from "./storeTypes";

function idsWithin(ids: string[], validIds: Set<string>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (validIds.has(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

function pruneSelection(selection: Selection, architecture: Architecture): Selection {
  return {
    componentIds: idsWithin(
      selection.componentIds,
      new Set(architecture.components.map((component) => component.id)),
    ),
    relationshipIds: idsWithin(
      selection.relationshipIds,
      new Set(architecture.relationships.map((relationship) => relationship.id)),
    ),
    groupIds: idsWithin(selection.groupIds, new Set(architecture.groups.map((group) => group.id))),
  };
}

function sameIds(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function sameSelection(left: Selection, right: Selection): boolean {
  return (
    sameIds(left.componentIds, right.componentIds) &&
    sameIds(left.relationshipIds, right.relationshipIds) &&
    sameIds(left.groupIds, right.groupIds)
  );
}

function restoreNonUndoableState(snapshot: Architecture, current: Architecture, updatedAt: string): Architecture {
  const restored: Architecture = {
    ...snapshot,
    name: current.name,
    updatedAt,
    ...(current.description === undefined ? {} : { description: current.description }),
    ...(current.canvas === undefined ? {} : { canvas: current.canvas }),
  };
  if (current.description === undefined) delete restored.description;
  return restored;
}

export function createEditorStore(initial: Architecture, now: () => string = () => new Date().toISOString()): EditorStore {
  let history = createHistory();
  let nextEntryId = 1;
  let state: EditorState = {
    architecture: initial,
    selection: { componentIds: [], relationshipIds: [], groupIds: [] },
    canUndo: false,
    canRedo: false,
    revision: 0,
    contentRevision: 0,
    historyHeadId: null,
  };
  const listeners = new Set<() => void>();

  function publish(next: EditorState): void {
    state = next;
    for (const listener of [...listeners]) listener();
  }

  function stateWithArchitecture(architecture: Architecture, contentChange: boolean): EditorState {
    return {
      ...state,
      architecture,
      selection: pruneSelection(state.selection, architecture),
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
      revision: state.revision + 1,
      contentRevision: state.contentRevision + (contentChange ? 1 : 0),
      historyHeadId: head(history)?.id ?? null,
    };
  }

  function undo(): void {
    const result = undoHistory(history);
    if (!result) {
      history = breakCoalescing(history);
      return;
    }
    history = result.history;
    const architecture = restoreNonUndoableState(result.architecture, state.architecture, now());
    publish(stateWithArchitecture(architecture, true));
  }

  function applyNonUndoableContentChange(architecture: Architecture): void {
    history = breakCoalescing(history);
    publish(stateWithArchitecture({ ...architecture, updatedAt: now() }, true));
  }

  return {
    getState() {
      return state;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    dispatch(command, options = {}): DispatchResult {
      try {
        const result = applyCommand(state.architecture, command);
        if (result.architecture === state.architecture) {
          if (options.coalesceKey !== history.openCoalesceKey) history = breakCoalescing(history);
          return { ok: true, ...(result.summary === undefined ? {} : { summary: result.summary }) };
        }

        const before = state.architecture;
        const after = { ...result.architecture, updatedAt: now() };
        history = push(history, {
          id: nextEntryId++,
          before,
          after,
          ...(options.coalesceKey === undefined ? {} : { coalesceKey: options.coalesceKey }),
          label: options.label ?? DEFAULT_COMMAND_LABELS[command.kind] ?? command.kind,
        });
        publish(stateWithArchitecture(after, true));
        const entryId = head(history)?.id;
        return {
          ok: true,
          ...(result.summary === undefined ? {} : { summary: result.summary }),
          ...(entryId === undefined ? {} : { entryId }),
        };
      } catch (error) {
        if (error instanceof DomainError) return { ok: false, error };
        throw error;
      }
    },

    undo,

    undoEntry(entryId) {
      if (head(history)?.id !== entryId) return false;
      undo();
      return true;
    },

    redo() {
      const result = redoHistory(history);
      if (!result) {
        history = breakCoalescing(history);
        return;
      }
      history = result.history;
      const architecture = restoreNonUndoableState(result.architecture, state.architecture, now());
      publish(stateWithArchitecture(architecture, true));
    },

    breakCoalescing() {
      history = breakCoalescing(history);
    },

    setSelection(selection) {
      history = breakCoalescing(history);
      const pruned = pruneSelection(selection, state.architecture);
      if (sameSelection(state.selection, pruned)) return;
      publish({ ...state, selection: pruned });
    },

    setViewport(viewport: Viewport) {
      if (
        !Number.isFinite(viewport.x) ||
        !Number.isFinite(viewport.y) ||
        !Number.isFinite(viewport.zoom) ||
        viewport.zoom <= 0
      ) {
        return;
      }
      const current = state.architecture.canvas?.viewport;
      if (current?.x === viewport.x && current.y === viewport.y && current.zoom === viewport.zoom) return;

      const architecture: Architecture = {
        ...state.architecture,
        canvas: { ...(state.architecture.canvas ?? {}), viewport: { ...viewport } },
      };
      publish({ ...state, architecture, revision: state.revision + 1 });
    },

    renameArchitecture(name) {
      if (name.trim().length === 0 || name === state.architecture.name) return;
      applyNonUndoableContentChange({ ...state.architecture, name });
    },

    setArchitectureDescription(description) {
      const normalized = description === "" ? undefined : description;
      if (normalized === state.architecture.description) return;
      const architecture = { ...state.architecture };
      if (normalized === undefined) delete architecture.description;
      else architecture.description = normalized;
      applyNonUndoableContentChange(architecture);
    },
  };
}
