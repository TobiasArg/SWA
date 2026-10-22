import { CanvasProvider, CanvasView } from "../canvas/CanvasView";
import { ConnectDialog } from "../canvas/ConnectDialog";
import * as editorActions from "../editor/actions";
import { createEditorStore } from "../editor/store";
import type { DispatchResult } from "../editor/storeTypes";
import { Inspector } from "../inspector/Inspector";
import { exportPng } from "../io/exportPng";
import { downloadArchitectureMarkdown } from "../io/exportMarkdown";
import { startAutosave } from "../persistence/autosave";
import { installUnloadGuard } from "../persistence/unloadGuard";
import { Palette } from "../palette";
import type { ActionFeedback, AppServices, EditorModules } from "./services";

function reportRejected(result: DispatchResult | undefined, feedback: ActionFeedback): void {
  if (result && !result.ok) feedback.showToast(result.error.message);
}

/** Editor-only service wiring is loaded with the editor route, not the library shell. */
export const defaultEditorServices: Pick<
  AppServices,
  | "createEditorStore"
  | "startAutosave"
  | "installUnloadGuard"
  | "exportPng"
  | "exportArchitectureMarkdown"
  | "actions"
> = {
  createEditorStore: (initial) => createEditorStore(initial),
  startAutosave,
  installUnloadGuard: (controller) => installUnloadGuard(controller),
  exportPng,
  exportArchitectureMarkdown: downloadArchitectureMarkdown,
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
