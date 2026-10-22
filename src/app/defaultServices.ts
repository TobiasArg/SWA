import { downloadArchitectureJson, downloadRawArchitectureJson } from "../io/exportJson";
import { downloadArchitectureMarkdown } from "../io/exportMarkdown";
import { importArchitectureFile } from "../io/importJson";
import { openRepository } from "../persistence/repository";
import { openArchitectureTabSync, subscribeArchitectureChanges } from "../persistence/tabSync";
import {
  createMemoryRepository,
  installPlaceholderUnloadGuard,
  startPlaceholderAutosave,
} from "./placeholders/persistence";
import { placeholderActions } from "./placeholders/actions";
import { createPlaceholderEditorStore } from "./placeholders/editorStore";
import {
  placeholderExportArchitectureJson,
  placeholderExportArchitectureMarkdown,
  placeholderExportPng,
  placeholderExportRawJson,
  placeholderImportArchitectureFile,
} from "./placeholders/io";
import type { AppServices } from "./services";
import { defaultEditorServices } from "./defaultModules";

/**
 * Compatibility wiring for callers that inject the old complete service/module pair.
 * App's default shell uses only library dependencies eagerly; this module is not imported
 * from App.tsx, so editor code remains behind the lazy route.
 */

let persistRequested = false;

function requestPersistentStorage(): void {
  if (persistRequested) return;
  persistRequested = true;
  void navigator.storage?.persist?.().catch(() => undefined);
}

const defaultLibraryServices: Pick<
  AppServices,
  | "openRepository"
  | "openTabSession"
  | "subscribeToRepositoryChanges"
  | "importArchitectureFile"
  | "exportArchitectureJson"
  | "exportArchitectureMarkdown"
  | "exportRawJson"
  | "requestPersistentStorage"
> = {
  openRepository: () => openRepository(),
  openTabSession: openArchitectureTabSync,
  subscribeToRepositoryChanges: (listener) => subscribeArchitectureChanges(() => listener()),
  importArchitectureFile,
  exportArchitectureJson: downloadArchitectureJson,
  exportArchitectureMarkdown: downloadArchitectureMarkdown,
  exportRawJson: downloadRawArchitectureJson,
  requestPersistentStorage,
};

export const defaultServices: AppServices = {
  ...defaultLibraryServices,
  ...defaultEditorServices,
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

export { defaultModules } from "./defaultModules";
export { placeholderModules } from "./placeholders/modules";
