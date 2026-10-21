import { CanvasProvider, CanvasView } from "../canvas/CanvasView";
import { ConnectDialog } from "../canvas/ConnectDialog";
import * as editorActions from "../editor/actions";
import { createEditorStore } from "../editor/store";
import type { DispatchResult } from "../editor/storeTypes";
import { Inspector } from "../inspector/Inspector";
import { exportPng } from "../io/exportPng";
import { downloadArchitectureJson, downloadRawArchitectureJson } from "../io/exportJson";
import { downloadArchitectureMarkdown } from "../io/exportMarkdown";
import { importArchitectureFile } from "../io/importJson";
import { startAutosave } from "../persistence/autosave";
import { openRepository } from "../persistence/repository";
import { openArchitectureTabSync, subscribeArchitectureChanges } from "../persistence/tabSync";
import { installUnloadGuard } from "../persistence/unloadGuard";
import { Palette } from "../palette";
import { placeholderActions } from "./placeholders/actions";
import { createPlaceholderEditorStore } from "./placeholders/editorStore";
import {
  placeholderExportArchitectureJson,
  placeholderExportArchitectureMarkdown,
  placeholderExportPng,
  placeholderExportRawJson,
  placeholderImportArchitectureFile,
} from "./placeholders/io";
import { placeholderModules } from "./placeholders/modules";
import {
  createMemoryRepository,
  installPlaceholderUnloadGuard,
  startPlaceholderAutosave,
} from "./placeholders/persistence";
import type { ActionFeedback, AppServices, EditorModules } from "./services";

/**
 * Integration wiring: the real workstream modules behind the shell's seam (services.ts).
 * `placeholderServices`/`placeholderModules` keep the shell's tests independent of them.
 */

let persistRequested = false;

function requestPersistentStorage(): void {
  if (persistRequested) return;
  persistRequested = true;
  void navigator.storage?.persist?.().catch(() => undefined);
}

function reportRejected(result: DispatchResult | undefined, feedback: ActionFeedback): void {
  if (result && !result.ok) feedback.showToast(result.error.message);
}

export const defaultServices: AppServices = {
  openRepository: () => openRepository(),
  createEditorStore: (initial) => createEditorStore(initial),
  startAutosave,
  installUnloadGuard: (controller) => installUnloadGuard(controller),
  openTabSession: openArchitectureTabSync,
  subscribeToRepositoryChanges: (listener) => subscribeArchitectureChanges(() => listener()),
  importArchitectureFile,
  exportArchitectureJson: downloadArchitectureJson,
  exportArchitectureMarkdown: downloadArchitectureMarkdown,
  exportRawJson: downloadRawArchitectureJson,
  exportPng,
  requestPersistentStorage,
  actions: {
    deleteSelection: (store, feedback) => reportRejected(editorActions.deleteSelection(store, feedback), feedback),
    duplicateSelection: (store, feedback) => reportRejected(editorActions.duplicateSelection(store), feedback),
    groupSelection: (store, feedback) => reportRejected(editorActions.groupSelection(store), feedback),
    ungroupSelection: (store, feedback) => reportRejected(editorActions.ungroupSelection(store), feedback),
    nudgeSelection: (store, dx, dy) => void editorActions.nudgeSelection(store, dx, dy),
  },
};

export const defaultModules: EditorModules = {
  CanvasProvider,
  CanvasView,
  Palette,
  Inspector,
  ConnectDialog,
};

export const placeholderServices: AppServices = {
  openRepository: async () => createMemoryRepository(),
  createEditorStore: (initial) => createPlaceholderEditorStore(initial),
  startAutosave: startPlaceholderAutosave,
  installUnloadGuard: installPlaceholderUnloadGuard,
  openTabSession: () => ({ close: () => undefined }),
  subscribeToRepositoryChanges: () => () => undefined,
  importArchitectureFile: placeholderImportArchitectureFile,
  exportArchitectureJson: placeholderExportArchitectureJson,
  exportArchitectureMarkdown: placeholderExportArchitectureMarkdown,
  exportRawJson: placeholderExportRawJson,
  exportPng: placeholderExportPng,
  requestPersistentStorage,
  actions: placeholderActions,
};

export { placeholderModules };
