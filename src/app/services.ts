import type { ComponentType, PropsWithChildren } from "react";
import type { CanvasApi } from "../canvas/canvasApi";
import type { Architecture } from "../domain/types";
import type { EditorStore } from "../editor/storeTypes";
import type { ImportResult } from "../io/types";
import type { DatabaseStatus } from "../persistence/db";
import type { SnapshotStore } from "../persistence/snapshots";
import type { Repository, SaveController } from "../persistence/types";
import type { ToastController } from "../ui/Toast";

/**
 * Integration seam between the app shell (WS-E) and the other workstreams.
 *
 * The shell only talks to persistence, IO, the editor store/actions and the canvas,
 * palette and inspector modules through these interfaces. `defaultServices.ts` and
 * `defaultModules.tsx` wire them; until WS-A/B/C/D land they point at the placeholders
 * in `src/app/placeholders/`, and integration swaps those imports for the real modules.
 */

/** Feedback channels the editor actions use (toast with Undo, live announcement). */
export interface ActionFeedback {
  showToast: ToastController["showToast"];
  dismissToast: ToastController["dismissToast"];
  announce(message: string): void;
}

/** `editor/actions.ts` (TD 5.3), adapted to receive the UI feedback channels. */
export interface EditorActions {
  deleteSelection(store: EditorStore, feedback: ActionFeedback): void;
  duplicateSelection(store: EditorStore, feedback: ActionFeedback): void;
  groupSelection(store: EditorStore, feedback: ActionFeedback): void;
  ungroupSelection(store: EditorStore, feedback: ActionFeedback): void;
  nudgeSelection(store: EditorStore, dx: number, dy: number): void;
}

/** One editor tab's registration with `persistence/tabSync.ts` (TD 8.6). */
export interface TabSession {
  close(): void;
}

/** Connection lifecycle of the IndexedDB repository (ROADMAP_V2_DESIGN §6.2). */
export interface RepositoryOpenOptions {
  /** `blocked` while an old tab holds the previous version; `blocking` when a newer tab upgrades. */
  onStatus?(status: DatabaseStatus): void;
}

export interface AppServices {
  /** Throws when IndexedDB is unavailable (TD 8.3 `StorageUnavailableError`). */
  openRepository(options?: RepositoryOpenOptions): Promise<Repository>;
  createEditorStore(initial: Architecture): EditorStore;
  startAutosave(store: EditorStore, repository: Repository): SaveController;
  /** Installs the `beforeunload` guard (TD 8.5); returns an uninstall function. */
  installUnloadGuard(controller: SaveController): () => void;
  /** Calls `onAlsoOpen` when another tab has the same architecture open. */
  openTabSession(architectureId: string, onAlsoOpen: () => void): TabSession;
  /** Calls the listener when another tab wrote to the repository (TD 8.6). */
  subscribeToRepositoryChanges(listener: () => void): () => void;
  importArchitectureFile(file: File, repository: Repository, now: () => string): Promise<ImportResult>;
  exportArchitectureJson(architecture: Architecture): void;
  /** Downloads the architecture as a human-readable Markdown document (`{slug}.md`). */
  exportArchitectureMarkdown(architecture: Architecture): void;
  /** Downloads a damaged record's raw stored JSON as `{slug}-raw.json` (TD 9.1). */
  exportRawJson(raw: unknown, name: string): void;
  exportPng(api: CanvasApi, name: string): Promise<void>;
  /** `navigator.storage.persist()` on the first create/import (TD 8.5). */
  requestPersistentStorage(): void;
  /**
   * Opens the browser-local versions store (ROADMAP_V2_DESIGN §6.3). Editor-only. Test doubles may
   * omit it; the editor then has no Versions and captures no snapshots.
   */
  openSnapshotStore?(): Promise<SnapshotStore>;
  actions: EditorActions;
}

export interface ConnectDialogProps {
  open: boolean;
  sourceId: string | null;
  onClose(): void;
}

/** Matches `inspector/inspectorContext.tsx` `InspectorActions` (WS-D) structurally. */
export interface InspectorActions {
  deleteSelection(store: EditorStore): void;
  duplicateSelection(store: EditorStore): void;
  groupSelection(store: EditorStore): void;
  openConnectDialog(sourceComponentId: string): void;
}

/**
 * `CanvasProvider` (canvas/CanvasView.tsx) wraps the whole editor so the toolbar, palette
 * and PNG export can read `CanvasApiContext`; `CanvasView` renders the surface inside it.
 */
export interface EditorModules {
  CanvasProvider: ComponentType<PropsWithChildren>;
  CanvasView: ComponentType;
  Palette: ComponentType<{ collapsed?: boolean }>;
  Inspector: ComponentType<{ actions: InspectorActions }>;
  ConnectDialog: ComponentType<ConnectDialogProps>;
}
