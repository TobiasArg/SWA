import type { Command, CommandResult, DomainError } from "../domain/commands";
import type { Architecture, Selection, Viewport } from "../domain/types";

export interface EditorState {
  architecture: Architecture;
  selection: Selection;
  canUndo: boolean;
  canRedo: boolean;
  revision: number;
  contentRevision: number;
}

export type DispatchResult =
  | { ok: true; summary?: CommandResult["summary"] }
  | { ok: false; error: DomainError };

export interface EditorStore {
  getState(): EditorState;
  subscribe(listener: () => void): () => void;
  dispatch(command: Command, options?: { coalesceKey?: string; label?: string }): DispatchResult;
  undo(): void;
  redo(): void;
  breakCoalescing(): void;
  setSelection(selection: Selection): void;
  setViewport(viewport: Viewport): void;
  renameArchitecture(name: string): void;
  setArchitectureDescription(description: string | undefined): void;
}

export type EqualityFn<T> = (previous: T, next: T) => boolean;
