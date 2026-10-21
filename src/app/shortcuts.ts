import { ARROW_NUDGE, ARROW_NUDGE_LARGE } from "../domain/constants";
import type { CanvasApi } from "../canvas/canvasApi";
import type { EditorStore } from "../editor/storeTypes";

/** Editor keyboard shortcuts (TD 6.7), handled by a single `keydown` listener. */

export interface ShortcutContext {
  store: EditorStore;
  isMac: boolean;
  getCanvasApi(): CanvasApi | null;
  undo(): void;
  redo(): void;
  deleteSelection(): void;
  duplicateSelection(): void;
  groupSelection(): void;
  ungroupSelection(): void;
  nudgeSelection(dx: number, dy: number): void;
  openConnectDialog(): void;
  /** Closes the topmost shell overlay (menu, drawer); returns true if one was closed. */
  closeOverlay(): boolean;
}

export function detectMac(): boolean {
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])"));
}

function isCanvasTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("[data-sa-canvas]"));
}

function hasOpenModal(): boolean {
  return Boolean(document.querySelector("dialog[open]"));
}

const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

export function createShortcutHandler(context: ShortcutContext): (event: KeyboardEvent) => void {
  return (event) => {
    // Native modal dialogs handle their own keys (Escape closes them, TD 12).
    if (event.defaultPrevented || event.isComposing || hasOpenModal()) return;

    const mod = context.isMac ? event.metaKey : event.ctrlKey;
    const otherMod = context.isMac ? event.ctrlKey : event.metaKey;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const editable = isEditableTarget(event.target);
    const { selection } = context.store.getState();

    if (mod && !event.altKey && key === "z") {
      event.preventDefault();
      if (event.shiftKey) context.redo();
      else context.undo();
      return;
    }
    if (event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && key === "y") {
      event.preventDefault();
      context.redo();
      return;
    }
    if (key === "Escape") {
      if (context.closeOverlay()) {
        event.preventDefault();
        return;
      }
      if (editable) return;
      const { componentIds, relationshipIds, groupIds } = selection;
      if (componentIds.length || relationshipIds.length || groupIds.length) {
        context.store.setSelection({ componentIds: [], relationshipIds: [], groupIds: [] });
      }
      return;
    }

    if (editable || event.altKey || otherMod) return;

    if (mod) {
      if (key === "d" && !event.shiftKey) {
        event.preventDefault();
        context.duplicateSelection();
      } else if (key === "g") {
        event.preventDefault();
        if (event.shiftKey) context.ungroupSelection();
        else context.groupSelection();
      } else if (key === "=" || key === "+") {
        event.preventDefault();
        context.getCanvasApi()?.zoomIn();
      } else if (key === "-" || key === "_") {
        event.preventDefault();
        context.getCanvasApi()?.zoomOut();
      }
      return;
    }

    if (key === "Delete" || key === "Backspace") {
      event.preventDefault();
      context.deleteSelection();
      return;
    }
    if (event.shiftKey && event.code === "Digit1") {
      event.preventDefault();
      context.getCanvasApi()?.fitView();
      return;
    }
    if (key === "c" && !event.shiftKey) {
      if (
        selection.componentIds.length === 1 &&
        selection.relationshipIds.length === 0 &&
        selection.groupIds.length === 0
      ) {
        event.preventDefault();
        context.openConnectDialog();
      }
      return;
    }
    const arrow = ARROWS[key];
    if (arrow && isCanvasTarget(event.target)) {
      if (!selection.componentIds.length && !selection.groupIds.length) return;
      event.preventDefault();
      const step = event.shiftKey ? ARROW_NUDGE_LARGE : ARROW_NUDGE;
      context.nudgeSelection(arrow[0] * step, arrow[1] * step);
    }
  };
}

/** Human-readable shortcut for tooltips, e.g. `shortcutLabel("Mod+Shift+G")`. */
export function shortcutLabel(shortcut: string, isMac: boolean): string {
  return shortcut
    .split("+")
    .map((part) => {
      if (part === "Mod") return isMac ? "⌘" : "Ctrl";
      if (part === "Shift") return isMac ? "⇧" : "Shift";
      return part;
    })
    .join(isMac ? "" : "+");
}
