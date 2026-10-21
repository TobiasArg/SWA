import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { CanvasApi } from "../canvas/canvasApi";
import type { Architecture, Selection } from "../domain/types";
import { useEditorState, useEditorStore } from "../editor/context";
import type { EditorState } from "../editor/storeTypes";
import type { SaveController } from "../persistence/types";
import { Button, type ButtonProps } from "../ui/Button";
import { Icon } from "../ui/icons";
import { Glyph } from "./glyphs";
import { SaveStatusIndicator } from "./SaveStatusIndicator";
import "./toolbar.css";

/** Editor toolbar (TD 11.4, handoff 10.1). */
export interface ToolbarProps {
  saveController: SaveController;
  canvasApi: CanvasApi | null;
  /** Formats a shortcut such as "Mod+Z" for tooltips. */
  formatShortcut(shortcut: string): string;
  onBack(): void;
  onUndo(): void;
  onRedo(): void;
  onGroup(): void;
  onUngroup(): void;
  onConnect(): void;
  onDelete(): void;
  onExportJson(): void;
  onExportPng(): Promise<void>;
  onImport(file: File): void;
}

const selectArchitecture = (state: EditorState) => state.architecture;
const selectSelection = (state: EditorState) => state.selection;
const selectCanUndo = (state: EditorState) => state.canUndo;
const selectCanRedo = (state: EditorState) => state.canRedo;

export function canUngroup(architecture: Architecture, selection: Selection): boolean {
  if (selection.groupIds.length) return true;
  const selected = new Set(selection.componentIds);
  return architecture.groups.some((group) => group.memberComponentIds.some((id) => selected.has(id)));
}

export function canConnect(selection: Selection): boolean {
  return (
    selection.componentIds.length === 1 &&
    selection.relationshipIds.length === 0 &&
    selection.groupIds.length === 0
  );
}

interface ToolButtonProps extends Omit<ButtonProps, "children"> {
  label: string;
  shortcut?: string;
  icon: ReactNode;
  /** Shows the label next to the icon on wide screens (it collapses to the icon below 1280px). */
  showLabel?: boolean;
}

function ToolButton({ label, shortcut, icon, showLabel = false, ...buttonProps }: ToolButtonProps) {
  const tipId = useId();
  return (
    <span className="sa-tool">
      <Button
        variant="ghost"
        iconOnly={!showLabel}
        aria-label={label}
        aria-describedby={shortcut ? tipId : undefined}
        className={showLabel ? "sa-tool__button sa-tool__button--labelled" : "sa-tool__button"}
        {...buttonProps}
      >
        {icon}
        {showLabel ? <span className="sa-tool__label">{label}</span> : null}
      </Button>
      <span role="tooltip" className="sa-tool__tip">
        <span aria-hidden>{label}</span>
        {shortcut ? (
          <kbd id={tipId} className="sa-tool__kbd">
            {shortcut}
          </kbd>
        ) : null}
      </span>
    </span>
  );
}

function ArchitectureNameInput() {
  const store = useEditorStore();
  const name = useEditorState((state) => state.architecture.name);
  // `null` while not editing, so the input follows the stored name (rename, undo in another view).
  const [draft, setDraft] = useState<string | null>(null);
  const reverting = useRef(false);

  const commit = () => {
    const trimmed = (draft ?? name).trim();
    const revert = reverting.current;
    reverting.current = false;
    if (!revert && trimmed && trimmed !== name) store.renameArchitecture(trimmed);
    setDraft(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      reverting.current = true;
      setDraft(null);
      event.currentTarget.blur();
    }
  };

  return (
    <input
      className="sa-toolbar__name"
      aria-label="Architecture name"
      value={draft ?? name}
      maxLength={50000}
      onFocus={() => setDraft(name)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      title={name}
    />
  );
}

function ExportMenu({
  canExportPng,
  onExportJson,
  onExportPng,
}: {
  canExportPng: boolean;
  onExportJson(): void;
  onExportPng(): Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>("[role='menuitem']:not(:disabled)")?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const items = [...(root.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']:not(:disabled)") ?? [])];
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length];
      next?.focus();
    }
    if (event.key === "Tab") setOpen(false);
  };

  const exportPng = async () => {
    setExporting(true);
    try {
      await onExportPng();
    } finally {
      setExporting(false);
      close(true);
    }
  };

  return (
    <div className="sa-menu" ref={root} onKeyDown={onMenuKeyDown}>
      <button
        ref={trigger}
        type="button"
        className="sa-button sa-button--ghost sa-toolbar__export"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label="Export"
        onClick={() => setOpen((value) => !value)}
      >
        <Glyph name="export" />
        <span className="sa-toolbar__collapsible-label">Export</span>
        <Glyph name="chevron-down" size={12} />
      </button>
      {open ? (
        <div className="sa-menu__popover" role="menu" id={menuId} aria-label="Export">
          <button
            type="button"
            role="menuitem"
            className="sa-menu__item"
            onClick={() => {
              onExportJson();
              close(true);
            }}
          >
            JSON file
          </button>
          <button
            type="button"
            role="menuitem"
            className="sa-menu__item"
            disabled={!canExportPng || exporting}
            onClick={() => void exportPng()}
          >
            {exporting ? "Exporting…" : "PNG image"}
            {!canExportPng ? <span className="sa-menu__hint">Nothing to export</span> : null}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function Toolbar({
  saveController,
  canvasApi,
  formatShortcut,
  onBack,
  onUndo,
  onRedo,
  onGroup,
  onUngroup,
  onConnect,
  onDelete,
  onExportJson,
  onExportPng,
  onImport,
}: ToolbarProps) {
  const architecture = useEditorState(selectArchitecture);
  const selection = useEditorState(selectSelection);
  const canUndo = useEditorState(selectCanUndo);
  const canRedo = useEditorState(selectCanRedo);
  const fileInput = useRef<HTMLInputElement>(null);

  const hasSelection =
    selection.componentIds.length + selection.relationshipIds.length + selection.groupIds.length > 0;
  const canExportPng = architecture.components.length + architecture.groups.length > 0;

  return (
    <header className="sa-toolbar">
      <div className="sa-toolbar__group sa-toolbar__group--identity">
        <Button variant="ghost" className="sa-toolbar__back" onClick={onBack}>
          <Glyph name="back" />
          <span className="sa-toolbar__back-label">Library</span>
        </Button>
        <span className="sa-toolbar__divider" aria-hidden />
        <ArchitectureNameInput />
        <SaveStatusIndicator controller={saveController} />
      </div>

      <div className="sa-toolbar__group" role="group" aria-label="History and view">
        <ToolButton label="Undo" shortcut={formatShortcut("Mod+Z")} icon={<Glyph name="undo" />} disabled={!canUndo} onClick={onUndo} />
        <ToolButton label="Redo" shortcut={formatShortcut("Mod+Shift+Z")} icon={<Glyph name="redo" />} disabled={!canRedo} onClick={onRedo} />
        <span className="sa-toolbar__divider" aria-hidden />
        <ToolButton label="Zoom out" shortcut={formatShortcut("Mod+-")} icon={<Icon name="minus" />} disabled={!canvasApi} onClick={() => canvasApi?.zoomOut()} />
        <ToolButton label="Zoom in" shortcut={formatShortcut("Mod+=")} icon={<Icon name="plus" />} disabled={!canvasApi} onClick={() => canvasApi?.zoomIn()} />
        <ToolButton label="Fit to content" shortcut={formatShortcut("Shift+1")} icon={<Icon name="fit" />} disabled={!canvasApi} onClick={() => canvasApi?.fitView()} />
      </div>

      <div className="sa-toolbar__group sa-toolbar__group--end">
        <div className="sa-toolbar__group" role="group" aria-label="Selection">
          <ToolButton label="Group" showLabel shortcut={formatShortcut("Mod+G")} icon={<Glyph name="group" />} disabled={selection.componentIds.length === 0} onClick={onGroup} />
          <ToolButton label="Ungroup" showLabel shortcut={formatShortcut("Mod+Shift+G")} icon={<Glyph name="ungroup" />} disabled={!canUngroup(architecture, selection)} onClick={onUngroup} />
          <ToolButton label="Connect…" showLabel shortcut="C" icon={<Glyph name="connect" />} disabled={!canConnect(selection)} onClick={onConnect} />
          <ToolButton label="Delete" shortcut="Delete" icon={<Glyph name="trash" />} disabled={!hasSelection} onClick={onDelete} />
        </div>
        <span className="sa-toolbar__divider" aria-hidden />
        <ExportMenu canExportPng={canExportPng} onExportJson={onExportJson} onExportPng={onExportPng} />
        <Button variant="ghost" aria-label="Import" onClick={() => fileInput.current?.click()}>
          <Glyph name="import" />
          <span className="sa-toolbar__collapsible-label">Import</span>
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          aria-hidden
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) onImport(file);
          }}
        />
      </div>
    </header>
  );
}
