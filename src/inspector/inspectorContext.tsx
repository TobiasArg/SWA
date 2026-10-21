import { createContext, useContext, useMemo, type PropsWithChildren } from "react";
import type { Command } from "../domain/commands";
import type { Selection } from "../domain/types";
import { useEditorStore } from "../editor/context";
import type { EditorStore } from "../editor/storeTypes";
import { announce } from "../ui/LiveRegion";

/**
 * Shared actions the inspector triggers. The `*Selection` members match the
 * `editor/actions.ts` helpers (TD 5.3) so the app can pass them through
 * unchanged; `openConnectDialog` opens the canvas ConnectDialog (TD 6.3).
 */
export interface InspectorActions {
  deleteSelection(store: EditorStore): void;
  duplicateSelection(store: EditorStore): void;
  groupSelection(store: EditorStore): void;
  openConnectDialog(sourceComponentId: string): void;
}

const InspectorActionsContext = createContext<InspectorActions | null>(null);

export interface InspectorActionsProviderProps extends PropsWithChildren {
  actions: InspectorActions;
}

export function InspectorActionsProvider({ actions, children }: InspectorActionsProviderProps) {
  return (
    <InspectorActionsContext.Provider value={actions}>{children}</InspectorActionsContext.Provider>
  );
}

export const EMPTY_SELECTION: Selection = { componentIds: [], relationshipIds: [], groupIds: [] };

export interface InspectorCommands {
  store: EditorStore;
  /** Dispatches a command; a rejected command is announced instead of thrown (TD 13). */
  dispatch(command: Command, coalesceKey?: string): boolean;
  breakCoalescing(): void;
  selectComponent(id: string): void;
  selectRelationship(id: string): void;
  run(action: Exclude<keyof InspectorActions, "openConnectDialog">): void;
  openConnectDialog(sourceComponentId: string): void;
}

export function useInspectorCommands(): InspectorCommands {
  const store = useEditorStore();
  const actions = useContext(InspectorActionsContext);
  if (!actions) {
    throw new Error("Inspector components must be rendered inside an InspectorActionsProvider.");
  }

  return useMemo<InspectorCommands>(
    () => ({
      store,
      dispatch(command, coalesceKey) {
        const result = store.dispatch(command, coalesceKey ? { coalesceKey } : undefined);
        if (!result.ok) announce(result.error.message);
        return result.ok;
      },
      breakCoalescing: () => store.breakCoalescing(),
      selectComponent: (id) => store.setSelection({ ...EMPTY_SELECTION, componentIds: [id] }),
      selectRelationship: (id) => store.setSelection({ ...EMPTY_SELECTION, relationshipIds: [id] }),
      run: (action) => actions[action](store),
      openConnectDialog: (id) => actions.openConnectDialog(id),
    }),
    [actions, store],
  );
}
