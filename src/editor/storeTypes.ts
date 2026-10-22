import type { Command, CommandResult, DomainError } from "../domain/commands";
import type { Architecture, Selection, Viewport } from "../domain/types";

export interface EditorState {
  architecture: Architecture;
  selection: Selection;
  canUndo: boolean;
  canRedo: boolean;
  revision: number;
  contentRevision: number;
  /** Id of the entry `undo` would revert next, or null when there is nothing to undo. */
  historyHeadId: number | null;
}

export type DispatchResult =
  /** `entryId` is set when the command created a history entry or was merged into the top one. */
  | { ok: true; summary?: CommandResult["summary"]; entryId?: number }
  | { ok: false; error: DomainError };

export interface EditorStore {
  getState(): EditorState;
  subscribe(listener: () => void): () => void;
  dispatch(command: Command, options?: { coalesceKey?: string; label?: string }): DispatchResult;
  undo(): void;
  /** Undoes only if `entryId` is the top undo entry. Returns false and changes nothing otherwise. */
  undoEntry(entryId: number): boolean;
  redo(): void;
  breakCoalescing(): void;
  setSelection(selection: Selection): void;
  setViewport(viewport: Viewport): void;
  renameArchitecture(name: string): void;
  setArchitectureDescription(description: string | undefined): void;
}

export type EqualityFn<T> = (previous: T, next: T) => boolean;
