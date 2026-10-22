import { useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { CanvasApiContext, type CanvasApi } from "../canvas/canvasApi";
import {
  deletionConfirmCopy,
  deletionTargets,
  previewDeletion,
  type DeletionConfirmCopy,
  type DeletionIntent,
} from "../editor/actions";
import { EditorProvider } from "../editor/context";
import type { EditorStore } from "../editor/storeTypes";
import { ImportErrorDialog } from "../library/dialogs";
import type { Repository, SaveController } from "../persistence/types";
import { Glyph } from "../toolbar/glyphs";
import { Toolbar } from "../toolbar/Toolbar";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Icon } from "../ui/icons";
import { announce } from "../ui/LiveRegion";
import { useToast } from "../ui/Toast";
import type { Selection } from "../domain/types";
import type { ValidationIssue } from "../domain/validation/issues";
import {
  initialPanelExpanded,
  INSPECTOR_DOCKED_QUERY,
  PALETTE_WIDE_QUERY,
  useMediaQuery,
  writePanelCollapsed,
} from "./panelPrefs";
import type { ActionFeedback, AppServices, EditorModules, InspectorActions } from "./services";
import { createShortcutHandler, detectMac, shortcutLabel } from "./shortcuts";
import "./app.css";

export const TAB_CONFLICT_MESSAGE =
  "This architecture is also open in another tab. Edits in one tab can overwrite edits in the other.";
export const PNG_EXPORT_FAILED_MESSAGE = "Image export failed. Try zooming out or reducing the diagram size.";
export const LEAVE_SAVE_FAILED_MESSAGE =
  "Your latest changes could not be saved. Retry the save or export to JSON before leaving.";

interface EditorSession {
  store: EditorStore;
  controller: SaveController;
}

/** A delete or ungroup waiting for the user's answer in the confirmation dialog. */
interface PendingDelete {
  store: EditorStore;
  intent: DeletionIntent;
  ids: Selection;
  copy: DeletionConfirmCopy;
  opener: HTMLElement | null;
}

function sameIds(a: Selection, b: Selection): boolean {
  const same = (x: string[], y: string[]) => x.length === y.length && x.every((id, index) => id === y[index]);
  return (
    same(a.componentIds, b.componentIds) && same(a.relationshipIds, b.relationshipIds) && same(a.groupIds, b.groupIds)
  );
}

/** The canvas focus target after a delete dialog closes (UI_COLOR_CONFIRMATION_DESIGN ED7). */
function focusCanvas(): void {
  document.querySelector<HTMLElement>("[data-sa-canvas]")?.focus({ preventScroll: true });
}

interface PendingConnectFocusReturn {
  generation: number;
  cancel(): void;
}

export interface EditorScreenProps {
  id: string;
  repository: Repository;
  services: AppServices;
  modules: EditorModules;
  /** Unknown or damaged ID (TD 11.1): back to the library with a toast. */
  onOpenFailed(): void;
  onLeave(): void;
  onOpenArchitecture(id: string): void;
  now?: () => string;
}

/**
 * Editor screen lifecycle (TD 11.3): `repo.get` → editor store → autosave → unload guard →
 * tab sync → render. On leave the pending save is flushed before disposal.
 */
export function EditorScreen(props: EditorScreenProps) {
  const { id, repository, services, onOpenFailed } = props;
  const [session, setSession] = useState<EditorSession | null>(null);
  const [tabConflict, setTabConflict] = useState(false);
  const openFailed = useRef(onOpenFailed);
  useEffect(() => {
    openFailed.current = onOpenFailed;
  }, [onOpenFailed]);

  useEffect(() => {
    let cancelled = false;
    let teardown: (() => void) | undefined;

    repository
      .get(id)
      .then((record) => {
        if (cancelled) return;
        if (!record || record.status !== "ok") {
          openFailed.current();
          return;
        }
        const store = services.createEditorStore(record.file.architecture);
        const controller = services.startAutosave(store, repository);
        const removeGuard = services.installUnloadGuard(controller);
        const tab = services.openTabSession(id, () => setTabConflict(true));
        teardown = () => {
          tab.close();
          void controller
            .flush()
            .catch(() => false)
            .finally(() => {
              removeGuard();
              controller.dispose();
            });
        };
        setSession({ store, controller });
      })
      .catch(() => {
        if (!cancelled) openFailed.current();
      });

    return () => {
      cancelled = true;
      teardown?.();
    };
  }, [id, repository, services]);

  if (!session) {
    return (
      <div className="sa-editor sa-editor--opening">
        <header className="sa-toolbar" aria-label="Editor toolbar" />
        <div className="sa-editor__body">
          <aside className="sa-editor__palette" aria-label="Component library" />
          <main className="sa-editor__canvas">
            <p className="sa-editor__canvas-hint" role="status">
              Opening architecture…
            </p>
          </main>
          <aside className="sa-editor__inspector" aria-label="Inspector" />
        </div>
      </div>
    );
  }

  const { CanvasProvider } = props.modules;
  return (
    <EditorProvider store={session.store}>
      <CanvasProvider>
        <EditorWorkspace {...props} session={session} tabConflict={tabConflict} />
      </CanvasProvider>
    </EditorProvider>
  );
}

interface EditorWorkspaceProps extends EditorScreenProps {
  session: EditorSession;
  tabConflict: boolean;
}

function EditorWorkspace({
  repository,
  services,
  modules,
  session,
  tabConflict,
  onLeave,
  onOpenArchitecture,
  now = () => new Date().toISOString(),
}: EditorWorkspaceProps) {
  const { store, controller } = session;
  const { CanvasView, Palette, Inspector, ConnectDialog } = modules;
  const { showToast } = useToast();
  const isMac = useMemo(() => detectMac(), []);
  const paletteId = useId();
  const inspectorId = useId();

  const canvasApi = useContext(CanvasApiContext);
  const canvasApiRef = useRef<CanvasApi | null>(canvasApi);
  const connectOpenerRef = useRef<HTMLElement | null>(null);
  const connectGenerationRef = useRef(0);
  const pendingConnectFocusRef = useRef<PendingConnectFocusReturn | null>(null);
  const [connectSource, setConnectSource] = useState<string | null>(null);
  const [importIssues, setImportIssues] = useState<ValidationIssue[] | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const pendingDeleteRef = useRef<PendingDelete | null>(null);
  const [paletteExpanded, setPaletteExpanded] = useState(() => initialPanelExpanded("palette", PALETTE_WIDE_QUERY));
  const [inspectorExpanded, setInspectorExpanded] = useState(() =>
    initialPanelExpanded("inspector", INSPECTOR_DOCKED_QUERY),
  );
  const inspectorDocked = useMediaQuery(INSPECTOR_DOCKED_QUERY);

  useEffect(() => {
    canvasApiRef.current = canvasApi;
  }, [canvasApi]);

  const feedback = useMemo<ActionFeedback>(() => ({ showToast, announce }), [showToast]);

  const undo = useCallback(() => {
    if (!store.getState().canUndo) return;
    store.undo();
    announce("Undid the last change.");
  }, [store]);

  const redo = useCallback(() => {
    if (!store.getState().canRedo) return;
    store.redo();
    announce("Redid the change.");
  }, [store]);

  const openConnectFor = useCallback((sourceId: string) => {
    pendingConnectFocusRef.current?.cancel();
    connectGenerationRef.current += 1;
    const active = document.activeElement;
    connectOpenerRef.current = active instanceof HTMLElement ? active : null;
    setConnectSource(sourceId);
  }, []);

  const openConnectDialog = useCallback(() => {
    const { componentIds, relationshipIds, groupIds } = store.getState().selection;
    if (componentIds.length === 1 && !relationshipIds.length && !groupIds.length) {
      const sourceId = componentIds[0];
      if (sourceId) openConnectFor(sourceId);
    }
  }, [openConnectFor, store]);

  const closeConnectDialog = useCallback(() => {
    setConnectSource(null);
    const generation = connectGenerationRef.current;
    const opener = connectOpenerRef.current;
    const { componentIds, relationshipIds, groupIds } = store.getState().selection;
    const connectionCreated = relationshipIds.length === 1 && componentIds.length === 0 && groupIds.length === 0;
    if (connectionCreated) {
      connectOpenerRef.current = null;
      return;
    }
    if (pendingConnectFocusRef.current?.generation === generation) return;

    let firstFrame = 0;
    let secondFrame = 0;
    const removeIntentListeners = () => {
      document.removeEventListener("keydown", cancel, true);
      document.removeEventListener("pointerdown", cancel, true);
    };
    const cancel = () => {
      if (pendingConnectFocusRef.current?.generation !== generation) return;
      pendingConnectFocusRef.current = null;
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
      removeIntentListeners();
    };
    const pending: PendingConnectFocusReturn = { generation, cancel };
    pendingConnectFocusRef.current = pending;
    document.addEventListener("keydown", cancel, true);
    document.addEventListener("pointerdown", cancel, true);
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        removeIntentListeners();
        if (pendingConnectFocusRef.current !== pending || generation !== connectGenerationRef.current) return;
        pendingConnectFocusRef.current = null;
        connectOpenerRef.current = null;
        const active = document.activeElement;
        const focusUnchanged =
          active === opener ||
          active === document.body ||
          active === document.documentElement ||
          (active instanceof Element && active.closest("dialog") !== null);
        if (opener?.isConnected && !opener.matches(":disabled") && focusUnchanged && !document.querySelector("dialog[open]")) {
          opener.focus({ preventScroll: true });
        }
      });
    });
  }, [store]);

  // Every UI route that dispatches `deleteElements` asks first (UI_COLOR_CONFIRMATION_DESIGN §2.3).
  const requestDelete = useCallback((target: EditorStore, intent: DeletionIntent) => {
    if (pendingDeleteRef.current) return;
    const { architecture, selection } = target.getState();
    const ids = deletionTargets(selection, intent);
    const preview = previewDeletion(architecture, ids);
    if (!preview) return;
    const active = document.activeElement;
    const pending: PendingDelete = {
      store: target,
      intent,
      ids,
      copy: deletionConfirmCopy(preview, intent),
      opener: active instanceof HTMLElement && active !== document.body ? active : null,
    };
    pendingDeleteRef.current = pending;
    setPendingDelete(pending);
  }, []);

  /** Closes the dialog synchronously, so nothing that follows renders behind its backdrop. */
  const closeDeleteDialog = useCallback(() => {
    const pending = pendingDeleteRef.current;
    pendingDeleteRef.current = null;
    flushSync(() => setPendingDelete(null));
    return pending;
  }, []);

  const cancelDelete = useCallback(() => {
    const pending = closeDeleteDialog();
    if (!pending) return;
    const { opener } = pending;
    if (opener?.isConnected && !opener.matches(":disabled")) opener.focus({ preventScroll: true });
    else focusCanvas();
  }, [closeDeleteDialog]);

  const confirmDelete = useCallback(() => {
    const pending = closeDeleteDialog();
    if (!pending) return;
    const { store: target, intent, ids } = pending;
    // The background is inert while the dialog is open; never delete a selection the user did not see.
    if (sameIds(deletionTargets(target.getState().selection, intent), ids)) {
      if (intent === "ungroup") services.actions.ungroupSelection(target, feedback);
      else services.actions.deleteSelection(target, feedback);
    }
    focusCanvas();
  }, [closeDeleteDialog, feedback, services]);

  const ungroupSelection = useCallback(
    (target: EditorStore) => {
      if (target.getState().selection.groupIds.length > 0) requestDelete(target, "ungroup");
      else services.actions.ungroupSelection(target, feedback);
    },
    [feedback, requestDelete, services],
  );

  const inspectorActions = useMemo<InspectorActions>(
    () => ({
      deleteSelection: (target) => requestDelete(target, "delete"),
      duplicateSelection: (target) => services.actions.duplicateSelection(target, feedback),
      groupSelection: (target) => services.actions.groupSelection(target, feedback),
      openConnectDialog: openConnectFor,
    }),
    [feedback, openConnectFor, requestDelete, services],
  );

  const togglePalette = () => {
    writePanelCollapsed("palette", paletteExpanded);
    setPaletteExpanded(!paletteExpanded);
  };

  const toggleInspector = () => {
    writePanelCollapsed("inspector", inspectorExpanded);
    setInspectorExpanded(!inspectorExpanded);
  };

  // Single keydown listener for the editor (TD 6.7).
  const shortcutState = useRef({ inspectorDocked, inspectorExpanded });
  useEffect(() => {
    shortcutState.current = { inspectorDocked, inspectorExpanded };
  }, [inspectorDocked, inspectorExpanded]);
  useEffect(() => {
    const handler = createShortcutHandler({
      store,
      isMac,
      getCanvasApi: () => canvasApiRef.current,
      undo,
      redo,
      deleteSelection: () => requestDelete(store, "delete"),
      duplicateSelection: () => services.actions.duplicateSelection(store, feedback),
      groupSelection: () => services.actions.groupSelection(store, feedback),
      ungroupSelection: () => ungroupSelection(store),
      nudgeSelection: (dx, dy) => services.actions.nudgeSelection(store, dx, dy),
      openConnectDialog,
      closeOverlay: () => {
        const { inspectorDocked: docked, inspectorExpanded: expanded } = shortcutState.current;
        if (docked || !expanded) return false;
        setInspectorExpanded(false);
        return true;
      },
    });
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [feedback, isMac, openConnectDialog, redo, requestDelete, services, store, undo, ungroupSelection]);

  // Save failures are announced once per transition into the error state (TD 12).
  useEffect(() => {
    let previous = controller.getStatus().status;
    return controller.subscribe(() => {
      const { status } = controller.getStatus();
      if (status === "error" && previous !== "error") announce("Save failed. Your changes are not saved yet.");
      previous = status;
    });
  }, [controller]);

  const leave = async () => {
    const saved = await controller.flush().catch(() => false);
    if (!saved) {
      showToast(LEAVE_SAVE_FAILED_MESSAGE);
      return;
    }
    onLeave();
  };

  const importFile = async (file: File) => {
    await controller.flush().catch(() => false);
    try {
      const result = await services.importArchitectureFile(file, repository, now);
      if (!result.ok) {
        setImportIssues(result.issues);
        announce("The file can't be imported. Nothing was saved.");
        return;
      }
      services.requestPersistentStorage();
      if (result.renamed) {
        showToast(
          `Imported as '${result.file.architecture.name}' because an architecture with the same ID already exists.`,
        );
      }
      announce(`Imported ${result.file.architecture.name}.`);
      onOpenArchitecture(result.file.architecture.id);
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error));
    }
  };

  const exportPng = async () => {
    try {
      if (!canvasApi) throw new Error("The canvas is not ready.");
      await services.exportPng(canvasApi, store.getState().architecture.name);
    } catch (error) {
      console.error(error);
      showToast(PNG_EXPORT_FAILED_MESSAGE);
    }
  };

  const formatShortcut = useCallback((shortcut: string) => shortcutLabel(shortcut, isMac), [isMac]);
  const inspectorOverlay = !inspectorDocked;

  return (
    <>
      <div className="sa-editor">
        <Toolbar
          saveController={controller}
          canvasApi={canvasApi}
          formatShortcut={formatShortcut}
          onBack={() => void leave()}
          onUndo={undo}
          onRedo={redo}
          onGroup={() => services.actions.groupSelection(store, feedback)}
          onUngroup={() => ungroupSelection(store)}
          onConnect={openConnectDialog}
          onDelete={() => requestDelete(store, "delete")}
          onExportJson={() => services.exportArchitectureJson(store.getState().architecture)}
          onExportMarkdown={() => services.exportArchitectureMarkdown(store.getState().architecture)}
          onExportPng={exportPng}
          onImport={(file) => void importFile(file)}
        />
        {tabConflict ? (
          <div className="sa-editor__banner" role="status">
            <Icon name="warning" />
            <span>{TAB_CONFLICT_MESSAGE}</span>
          </div>
        ) : null}
        <div className="sa-editor__body">
          <aside
            className={`sa-editor__palette${paletteExpanded ? "" : " sa-editor__palette--collapsed"}`}
            aria-label="Component library"
          >
            <button
              type="button"
              className="sa-button sa-button--ghost sa-button--icon-only sa-editor__panel-toggle"
              aria-expanded={paletteExpanded}
              aria-controls={paletteId}
              aria-label={paletteExpanded ? "Collapse component library" : "Expand component library"}
              title={paletteExpanded ? "Collapse component library" : "Expand component library"}
              onClick={togglePalette}
            >
              <Glyph name={paletteExpanded ? "chevron-left" : "chevron-right"} />
            </button>
            <div id={paletteId} className="sa-editor__palette-content">
              <Palette collapsed={!paletteExpanded} />
            </div>
          </aside>

          <main className="sa-editor__canvas" data-sa-canvas aria-label="Canvas" tabIndex={-1}>
            <CanvasView />
          </main>

          <div
            className={[
              "sa-editor__inspector-dock",
              inspectorExpanded ? "sa-editor__inspector-dock--open" : "",
              inspectorOverlay ? "sa-editor__inspector-dock--overlay" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <button
              type="button"
              className="sa-editor__inspector-toggle"
              aria-expanded={inspectorExpanded}
              aria-controls={inspectorId}
              aria-label={inspectorExpanded ? "Collapse inspector" : "Expand inspector"}
              title={inspectorExpanded ? "Collapse inspector" : "Expand inspector"}
              onClick={toggleInspector}
            >
              <Glyph name={inspectorExpanded ? "chevron-right" : "chevron-left"} />
            </button>
            <aside id={inspectorId} className="sa-editor__inspector" aria-label="Inspector" hidden={!inspectorExpanded}>
              <Inspector actions={inspectorActions} />
            </aside>
          </div>
        </div>

        <ConnectDialog open={connectSource !== null} sourceId={connectSource} onClose={closeConnectDialog} />
        <ImportErrorDialog issues={importIssues} onClose={() => setImportIssues(null)} />
        <ConfirmDialog
          open={pendingDelete !== null}
          title={pendingDelete?.copy.title ?? "Delete?"}
          description={pendingDelete?.copy.description}
          confirmLabel={pendingDelete?.copy.confirmLabel}
          onCancel={cancelDelete}
          onConfirm={confirmDelete}
        />
      </div>
    </>
  );
}
