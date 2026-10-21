/**
 * TEST-ONLY recording wrapper around the real editor store (`src/editor/store.ts`)
 * for canvas tests. Every command goes through the real `applyCommand` and
 * history, so tests exercise real domain semantics (undo included); the wrapper
 * additionally records what the canvas dispatched. Do not import from production
 * code.
 */
import type { Command } from "../../domain/commands";
import type { Architecture, Selection, Viewport } from "../../domain/types";
import { createEditorStore } from "../../editor/store";
import type { EditorStore } from "../../editor/storeTypes";

export interface FakeEditorStore extends EditorStore {
  /** Every command passed to `dispatch`, in order (including rejected ones). */
  readonly commands: Command[];
  /** Every selection passed to `setSelection`, in order. */
  readonly selections: Selection[];
  /** Every viewport passed to `setViewport`, in order. */
  readonly viewports: Viewport[];
}

export const EMPTY_SELECTION: Selection = { componentIds: [], relationshipIds: [], groupIds: [] };

const FIXED_NOW = () => "2026-10-21T00:00:00.000Z";

export function createFakeStore(
  initial: Architecture,
  initialSelection: Selection = EMPTY_SELECTION,
): FakeEditorStore {
  const store = createEditorStore(initial, FIXED_NOW);
  if (initialSelection !== EMPTY_SELECTION) store.setSelection(initialSelection);

  const commands: Command[] = [];
  const selections: Selection[] = [];
  const viewports: Viewport[] = [];

  return {
    commands,
    selections,
    viewports,
    getState: () => store.getState(),
    subscribe: (listener) => store.subscribe(listener),
    dispatch(command, options) {
      commands.push(command);
      return store.dispatch(command, options);
    },
    undo: () => store.undo(),
    redo: () => store.redo(),
    breakCoalescing: () => store.breakCoalescing(),
    setSelection(selection) {
      selections.push(selection);
      store.setSelection(selection);
    },
    setViewport(viewport) {
      viewports.push(viewport);
      store.setViewport(viewport);
    },
    renameArchitecture: (name) => store.renameArchitecture(name),
    setArchitectureDescription: (description) => store.setArchitectureDescription(description),
  };
}
