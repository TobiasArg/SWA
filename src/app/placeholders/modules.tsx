import { createContext, useContext, useMemo, useRef, useState, type PropsWithChildren, type RefObject } from "react";
import { COMPONENT_TYPE_LABELS, DEFAULT_COMPONENT_NAMES, DEFAULT_SIZE, RELATIONSHIP_TYPES, defaultDirection } from "../../domain/constants";
import { CanvasApiContext, type CanvasApi } from "../../canvas/canvasApi";
import { componentRect } from "../../domain/geometry";
import type { Component, ComponentType, RelationshipType } from "../../domain/types";
import { useEditorState, useEditorStore } from "../../editor/context";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Icon, type IconName } from "../../ui/icons";
import type { ConnectDialogProps, EditorModules } from "../services";

/**
 * Placeholders for `canvas/CanvasView.tsx` (CanvasProvider + CanvasView), `palette/Palette.tsx`,
 * `canvas/ConnectDialog.tsx` (WS-C) and `inspector/Inspector.tsx` (WS-D). They implement just
 * enough of the documented interfaces to exercise the shell and serve as test doubles.
 */

const PlaceholderHostContext = createContext<RefObject<HTMLDivElement | null> | null>(null);

function PlaceholderCanvasProvider({ children }: PropsWithChildren) {
  const store = useEditorStore();
  const host = useRef<HTMLDivElement | null>(null);
  const api = useMemo<CanvasApi>(
    () => ({
      zoomIn: () => undefined,
      zoomOut: () => undefined,
      fitView: () => undefined,
      screenToFlowPosition: (position) => position,
      getViewportElement: () => host.current,
      revealComponent: async (id) => store.getState().architecture.components.some((c) => c.id === id),
      getDiagramBounds() {
        return this.getNodesBounds();
      },
      getNodesBounds() {
        const rects = store.getState().architecture.components.map(componentRect);
        if (!rects.length) return { x: 0, y: 0, width: 0, height: 0 };
        const x = Math.min(...rects.map((r) => r.x));
        const y = Math.min(...rects.map((r) => r.y));
        return {
          x,
          y,
          width: Math.max(...rects.map((r) => r.x + r.width)) - x,
          height: Math.max(...rects.map((r) => r.y + r.height)) - y,
        };
      },
    }),
    [store],
  );

  return (
    <PlaceholderHostContext.Provider value={host}>
      <CanvasApiContext.Provider value={api}>{children}</CanvasApiContext.Provider>
    </PlaceholderHostContext.Provider>
  );
}

function PlaceholderCanvas() {
  const store = useEditorStore();
  const host = useContext(PlaceholderHostContext);
  const components = useEditorState((state) => state.architecture.components);
  const selected = useEditorState((state) => state.selection.componentIds);

  return (
    <div className="sa-placeholder-canvas" ref={host} tabIndex={0} aria-label="Canvas surface">
      {components.length === 0 ? (
        <p className="sa-editor__canvas-hint">
          Add components from the library on the left: click to place, or drag onto the canvas.
        </p>
      ) : (
        <ul className="sa-placeholder-canvas__list">
          {components.map((component) => (
            <li key={component.id}>
              <button
                type="button"
                aria-pressed={selected.includes(component.id)}
                onClick={() =>
                  store.setSelection({ componentIds: [component.id], relationshipIds: [], groupIds: [] })
                }
              >
                {COMPONENT_TYPE_LABELS[component.type]}: {component.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const PALETTE_ITEMS: { type: ComponentType; subtype?: "orchestrator"; label: string; icon: IconName }[] = [
  { type: "agent", subtype: "orchestrator", label: "Orchestrator", icon: "orchestrator" },
  { type: "agent", label: "Agent", icon: "agent" },
  { type: "tool", label: "Tool", icon: "tool" },
  { type: "memory", label: "Memory / Data Store", icon: "memory" },
  { type: "external_system", label: "External System", icon: "external" },
  { type: "decision", label: "Decision / Routing Rule", icon: "decision" },
];

function PlaceholderPalette({ collapsed = false }: { collapsed?: boolean }) {
  const store = useEditorStore();

  const add = (item: (typeof PALETTE_ITEMS)[number]) => {
    const { components } = store.getState().architecture;
    const base = item.subtype === "orchestrator" ? "Orchestrator" : DEFAULT_COMPONENT_NAMES[item.type];
    const names = new Set(components.map((c) => c.name));
    let name = base;
    for (let n = 2; names.has(name); n += 1) name = `${base} ${n}`;
    const offset = components.length * 24;
    const component: Component = {
      id: `cmp_${crypto.randomUUID()}`,
      type: item.type,
      ...(item.subtype ? { subtype: item.subtype } : {}),
      name,
      position: { x: offset - DEFAULT_SIZE[item.type].width / 2, y: offset - DEFAULT_SIZE[item.type].height / 2 },
    };
    const result = store.dispatch({ kind: "addComponent", component }, { label: "Add component" });
    if (result.ok) store.setSelection({ componentIds: [component.id], relationshipIds: [], groupIds: [] });
  };

  return (
    <ul className="sa-placeholder-palette">
      {PALETTE_ITEMS.map((item) => (
        <li key={item.label}>
          <Button
            variant="ghost"
            iconOnly={collapsed}
            aria-label={collapsed ? item.label : undefined}
            title={collapsed ? item.label : undefined}
            onClick={() => add(item)}
          >
            <Icon name={item.icon} />
            {collapsed ? null : item.label}
          </Button>
        </li>
      ))}
    </ul>
  );
}

function PlaceholderInspector(_props: { actions: unknown }) {
  const architecture = useEditorState((state) => state.architecture);
  const selection = useEditorState((state) => state.selection);
  const selectedCount =
    selection.componentIds.length + selection.relationshipIds.length + selection.groupIds.length;

  return (
    <div className="sa-placeholder-inspector">
      <p className="sa-placeholder-inspector__label">{selectedCount ? "SELECTION" : "ARCHITECTURE"}</p>
      <h2>{selectedCount ? `${selectedCount} selected` : architecture.name}</h2>
      <p>
        {architecture.components.length} components, {architecture.relationships.length} relationships,{" "}
        {architecture.groups.length} groups.
      </p>
    </div>
  );
}

function PlaceholderConnectDialog({ open, sourceId, onClose }: ConnectDialogProps) {
  const store = useEditorStore();
  const components = useEditorState((state) => state.architecture.components);
  const targets = useMemo(
    () => components.filter((c) => c.id !== sourceId).sort((a, b) => a.name.localeCompare(b.name)),
    [components, sourceId],
  );
  const [type, setType] = useState<RelationshipType>("delegates_to");
  const [targetId, setTargetId] = useState("");

  const confirm = () => {
    const target = targetId || targets[0]?.id;
    if (!sourceId || !target) return;
    const id = `rel_${crypto.randomUUID()}`;
    const result = store.dispatch(
      {
        kind: "addRelationship",
        relationship: { id, type, sourceId, targetId: target, direction: defaultDirection(type) },
      },
      { label: "Connect" },
    );
    if (result.ok) store.setSelection({ componentIds: [], relationshipIds: [id], groupIds: [] });
    onClose();
  };

  return (
    <Dialog
      open={open}
      title="Connect"
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={confirm} disabled={!targets.length}>
            Connect
          </Button>
        </>
      }
    >
      <label className="sa-field">
        <span>Relationship type</span>
        <select value={type} onChange={(event) => setType(event.target.value as RelationshipType)}>
          {(Object.keys(RELATIONSHIP_TYPES) as RelationshipType[]).map((key) => (
            <option key={key} value={key}>
              {RELATIONSHIP_TYPES[key].label}
            </option>
          ))}
        </select>
      </label>
      <label className="sa-field">
        <span>Target component</span>
        <select value={targetId || targets[0]?.id || ""} onChange={(event) => setTargetId(event.target.value)}>
          {targets.map((component) => (
            <option key={component.id} value={component.id}>
              {component.name}
            </option>
          ))}
        </select>
      </label>
    </Dialog>
  );
}

export const placeholderModules: EditorModules = {
  CanvasProvider: PlaceholderCanvasProvider,
  CanvasView: PlaceholderCanvas,
  Palette: PlaceholderPalette,
  Inspector: PlaceholderInspector,
  ConnectDialog: PlaceholderConnectDialog,
};
