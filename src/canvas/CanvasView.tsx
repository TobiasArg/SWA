/**
 * The editor canvas (TD 6.1).
 *
 * Intended mounting (inside an EditorProvider):
 *
 *   <CanvasProvider>          // ReactFlowProvider + CanvasApiContext
 *     <Toolbar />             // may call useCanvasApi()
 *     <Palette />             // may call useCanvasApi()
 *     <main><CanvasView /></main>
 *   </CanvasProvider>
 *
 * `<CanvasView>{children}</CanvasView>` also works without an outer provider: it
 * then creates its own CanvasProvider and renders `children` inside it, after the
 * canvas surface (useful for overlays or tests).
 *
 * React Flow is fully controlled: nodes/edges are projected from the domain
 * architecture; local node state only holds transient gesture state (position
 * while dragging, dimensions, selection flags). Domain changes go through
 * `store.dispatch`; selection and viewport go through the store's direct methods.
 */
import "@xyflow/react/dist/style.css";
import "./canvas.css";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PropsWithChildren,
  type RefObject,
} from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ConnectionMode,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  useStoreApi,
  type AriaLabelConfig,
  type ConnectionLineComponent,
  type EdgeChange,
  type EdgeTypes,
  type IsValidConnection,
  type NodeChange,
  type NodeTypes,
  type OnMoveEnd,
  type Viewport as FlowViewport,
} from "@xyflow/react";
import type { Architecture, RelationshipType, Selection } from "../domain/types";
import { useEditorState, useEditorStore } from "../editor/context";
import type { EditorState } from "../editor/storeTypes";
import { CanvasApiContext, type CanvasApi } from "./canvasApi";
import { addRelationshipAndSelect } from "./connection";
import { ConnectionLine } from "./ConnectionLine";
import { RelationshipEdge } from "./edges/RelationshipEdge";
import {
  COMPONENT_NODE_TYPE,
  GROUP_NODE_TYPE,
  RELATIONSHIP_EDGE_TYPE,
  type CanvasNode,
  type RelationshipFlowEdge,
} from "./flowTypes";
import { useCanvasInteractions } from "./interactions";
import { CanvasNodeCallbacksContext } from "./nodeContext";
import { isAppliedNodeChange, mergeProjectedNodes } from "./nodeState";
import { ComponentNode } from "./nodes/ComponentNode";
import { GroupNode } from "./nodes/GroupNode";
import { toFlowEdges, toFlowNodes } from "./projection";
import { handlePaletteDragOver, handlePaletteDrop } from "./paletteDrop";
import { RelationshipTypePicker } from "./RelationshipTypePicker";
import { applySelectionChanges, selectionFromFocusedElement } from "./selection";

const nodeTypes: NodeTypes = {
  [COMPONENT_NODE_TYPE]: ComponentNode,
  [GROUP_NODE_TYPE]: GroupNode,
};

const edgeTypes: EdgeTypes = {
  [RELATIONSHIP_EDGE_TYPE]: RelationshipEdge,
};

const connectionLine = ConnectionLine as ConnectionLineComponent<CanvasNode>;

export const CANVAS_MIN_ZOOM = 0.2;
export const CANVAS_MAX_ZOOM = 2;
const FIT_VIEW_OPTIONS = { padding: 0.1 } as const;

export const EMPTY_CANVAS_HINT =
  "Add components from the library on the left: click to place, or drag onto the canvas.";

const NODE_DESCRIPTION =
  "Press Enter or Space to select. Use the arrow keys to move selected components, Delete to remove them, and Escape to clear the selection.";

export const CANVAS_ARIA_LABELS: Partial<AriaLabelConfig> = {
  "node.a11yDescription.default": NODE_DESCRIPTION,
  "node.a11yDescription.keyboardDisabled": NODE_DESCRIPTION,
  "edge.a11yDescription.default":
    "Press Enter or Space to select this relationship. Press Delete to remove it and Escape to clear the selection.",
  "minimap.ariaLabel": "Canvas overview",
  "handle.ariaLabel": "Connection point. Drag to another component to create a relationship.",
};

// ---------------------------------------------------------------------------
// Provider: ReactFlowProvider + CanvasApi
// ---------------------------------------------------------------------------

/** Lets CanvasView register its root element with the surrounding CanvasProvider. */
const CanvasHostContext = createContext<RefObject<HTMLDivElement | null> | null>(null);

function CanvasApiBridge({ children }: PropsWithChildren) {
  const flow = useReactFlow<CanvasNode, RelationshipFlowEdge>();
  const hostRef = useRef<HTMLDivElement | null>(null);

  const api = useMemo<CanvasApi>(
    () => ({
      zoomIn: () => void flow.zoomIn(),
      zoomOut: () => void flow.zoomOut(),
      fitView: () => void flow.fitView(FIT_VIEW_OPTIONS),
      screenToFlowPosition: (position) => flow.screenToFlowPosition(position),
      getViewportElement: () => hostRef.current?.querySelector<HTMLElement>(".react-flow__viewport") ?? null,
      getNodesBounds: () => {
        const bounds = flow.getNodesBounds(flow.getNodes());
        return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
      },
    }),
    [flow],
  );

  return (
    <CanvasHostContext.Provider value={hostRef}>
      <CanvasApiContext.Provider value={api}>{children}</CanvasApiContext.Provider>
    </CanvasHostContext.Provider>
  );
}

/** ReactFlowProvider plus the CanvasApi context for toolbar, palette and PNG export. */
export function CanvasProvider({ children }: PropsWithChildren) {
  return (
    <ReactFlowProvider>
      <CanvasApiBridge>{children}</CanvasApiBridge>
    </ReactFlowProvider>
  );
}

// ---------------------------------------------------------------------------
// Canvas surface
// ---------------------------------------------------------------------------

const selectComponents = (state: EditorState) => state.architecture.components;
const selectRelationships = (state: EditorState) => state.architecture.relationships;
const selectGroups = (state: EditorState) => state.architecture.groups;
const selectSelection = (state: EditorState) => state.selection;

function projectionInput(
  components: Architecture["components"],
  relationships: Architecture["relationships"],
  groups: Architecture["groups"],
): Architecture {
  // Only the content arrays matter for the projection; the other fields are inert.
  return {
    id: "",
    name: "",
    createdAt: "",
    updatedAt: "",
    components,
    relationships,
    groups,
  };
}

function CanvasSurface() {
  const store = useEditorStore();
  const hostRef = useContext(CanvasHostContext);
  const components = useEditorState(selectComponents);
  const relationships = useEditorState(selectRelationships);
  const groups = useEditorState(selectGroups);
  const selection: Selection = useEditorState(selectSelection);

  const architecture = useMemo(
    () => projectionInput(components, relationships, groups),
    [components, relationships, groups],
  );
  const projectedNodes = useMemo(() => toFlowNodes(architecture, selection), [architecture, selection]);
  const edges = useMemo(() => toFlowEdges(architecture, selection), [architecture, selection]);

  const [nodes, setNodes] = useState<CanvasNode[]>(projectedNodes);
  const flowStore = useStoreApi<CanvasNode, RelationshipFlowEdge>();
  const flow = useReactFlow<CanvasNode, RelationshipFlowEdge>();

  const resync = useCallback(() => {
    const { architecture: current, selection: currentSelection } = store.getState();
    setNodes((previous) => mergeProjectedNodes(toFlowNodes(current, currentSelection), previous, false));
  }, [store]);
  const cancelFlowConnection = useCallback(() => flowStore.getState().cancelConnection(), [flowStore]);

  const interactions = useCanvasInteractions({ store, resync, updateNodes: setNodes, cancelFlowConnection });
  const { withActiveDrag } = interactions;

  // Local transient node state, re-synced whenever the projection changes
  // (derived-state-during-render pattern; no extra commit with stale nodes).
  // An active drag keeps its transient layout (members following their group).
  const [syncedProjection, setSyncedProjection] = useState(projectedNodes);
  if (syncedProjection !== projectedNodes) {
    setSyncedProjection(projectedNodes);
    setNodes((previous) => withActiveDrag(mergeProjectedNodes(projectedNodes, previous, true)));
  }

  // Viewport: restore the stored one, otherwise fit on open (read once at mount).
  const [initialViewport] = useState(() => store.getState().architecture.canvas?.viewport);

  const onNodesChange = useCallback(
    (changes: NodeChange<CanvasNode>[]) => {
      const applied = changes.filter(isAppliedNodeChange);
      if (applied.length === 0) return;
      setNodes((previous) => applyNodeChanges(applied, previous));
      const selectChanges = applied.flatMap((change) => (change.type === "select" ? [change] : []));
      if (selectChanges.length > 0) {
        const { architecture: current, selection: currentSelection } = store.getState();
        const next = applySelectionChanges(current, currentSelection, selectChanges, []);
        if (next) store.setSelection(next);
      }
    },
    [store],
  );

  // Box selection selects nodes only: React Flow would also select every edge
  // connected to a boxed node, which is not what the user framed.
  const boxSelecting = useRef(false);
  const onSelectionStart = useCallback(() => {
    boxSelecting.current = true;
  }, []);
  const onSelectionEnd = useCallback(() => {
    boxSelecting.current = false;
  }, []);

  const onEdgesChange = useCallback(
    (changes: EdgeChange<RelationshipFlowEdge>[]) => {
      const selectChanges = changes.flatMap((change) =>
        change.type === "select" && !(boxSelecting.current && change.selected) ? [change] : [],
      );
      if (selectChanges.length === 0) return;
      const { architecture: current, selection: currentSelection } = store.getState();
      const next = applySelectionChanges(current, currentSelection, [], selectChanges);
      if (next) store.setSelection(next);
    },
    [store],
  );

  const onPaneClick = useCallback(() => {
    const { selection: current } = store.getState();
    if (current.componentIds.length + current.relationshipIds.length + current.groupIds.length > 0) {
      store.setSelection({ componentIds: [], relationshipIds: [], groupIds: [] });
    }
  }, [store]);

  const componentIds = useMemo(() => new Set(components.map((component) => component.id)), [components]);
  const isValidConnection = useCallback<IsValidConnection<RelationshipFlowEdge>>(
    (connection) =>
      Boolean(connection.source) &&
      Boolean(connection.target) &&
      connection.source !== connection.target &&
      componentIds.has(connection.source) &&
      componentIds.has(connection.target),
    [componentIds],
  );

  const onMoveEnd = useCallback<OnMoveEnd>(
    (_event, viewport: FlowViewport) => {
      const stored = store.getState().architecture.canvas?.viewport;
      if (stored && stored.x === viewport.x && stored.y === viewport.y && stored.zoom === viewport.zoom) return;
      store.setViewport({ x: viewport.x, y: viewport.y, zoom: viewport.zoom });
    },
    [store],
  );

  // React Flow's own Enter/Space selection is switched off together with its
  // arrow-key movement (`disableKeyboardA11y`), so keyboard selection of the
  // focused node/edge is handled here (TD 6.1, 12).
  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const { architecture: current, selection: currentSelection } = store.getState();
      const next = selectionFromFocusedElement(
        current,
        currentSelection,
        event.target,
        event.metaKey || event.ctrlKey || event.shiftKey,
      );
      if (!next) return;
      event.preventDefault();
      store.setSelection(next);
    },
    [store],
  );

  const nodeCallbacks = useMemo(() => ({ onResizeEnd: interactions.onResizeEnd }), [interactions.onResizeEnd]);

  // ---- Relationship type picker (TD 6.3) ----------------------------------
  const { pendingConnection, clearPendingConnection } = interactions;
  const focusNode = useCallback(
    (id: string) => {
      const host = hostRef?.current;
      if (!host) return;
      for (const element of host.querySelectorAll<HTMLElement>(".react-flow__node")) {
        if (element.getAttribute("data-id") === id) {
          element.focus({ preventScroll: true });
          return;
        }
      }
    },
    [hostRef],
  );
  const choosePickerType = useCallback(
    (type: RelationshipType) => {
      if (!pendingConnection) return;
      addRelationshipAndSelect(store, type, pendingConnection.sourceId, pendingConnection.targetId);
      clearPendingConnection();
      focusNode(pendingConnection.sourceId);
    },
    [clearPendingConnection, focusNode, pendingConnection, store],
  );
  const cancelPicker = useCallback(() => {
    if (!pendingConnection) return;
    clearPendingConnection();
    focusNode(pendingConnection.sourceId);
  }, [clearPendingConnection, focusNode, pendingConnection]);

  // ---- Palette drop (TD 6.3) ----------------------------------------------
  const onDragOver = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    handlePaletteDragOver(event);
  }, []);
  const onDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      handlePaletteDrop(store, event, (position) => flow.screenToFlowPosition(position));
    },
    [flow, store],
  );

  return (
    <div
      className="sa-canvas"
      ref={hostRef}
      onKeyDown={onKeyDown}
      data-connecting={interactions.connecting ?? undefined}
    >
      <CanvasNodeCallbacksContext.Provider value={nodeCallbacks}>
        <ReactFlow<CanvasNode, RelationshipFlowEdge>
          className="sa-flow"
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStart={interactions.onNodeDragStart}
          onNodeDrag={interactions.onNodeDrag}
          onNodeDragStop={interactions.onNodeDragStop}
          onConnectStart={interactions.onConnectStart}
          onConnect={interactions.onConnect}
          onConnectEnd={interactions.onConnectEnd}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onPaneClick={onPaneClick}
          onSelectionStart={onSelectionStart}
          onSelectionEnd={onSelectionEnd}
          onMoveEnd={onMoveEnd}
          isValidConnection={isValidConnection}
          connectionMode={ConnectionMode.Loose}
          connectionLineType={ConnectionLineType.Straight}
          connectionLineComponent={connectionLine}
          deleteKeyCode={null}
          edgesReconnectable={false}
          elevateNodesOnSelect={false}
          elevateEdgesOnSelect={false}
          disableKeyboardA11y
          nodesFocusable
          edgesFocusable
          minZoom={CANVAS_MIN_ZOOM}
          maxZoom={CANVAS_MAX_ZOOM}
          defaultViewport={initialViewport}
          fitView={initialViewport === undefined}
          fitViewOptions={FIT_VIEW_OPTIONS}
          ariaLabelConfig={CANVAS_ARIA_LABELS}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="var(--sa-color-canvas-grid)" />
          <MiniMap className="sa-minimap" pannable={false} zoomable={false} />
        </ReactFlow>
      </CanvasNodeCallbacksContext.Provider>
      {components.length === 0 ? <p className="sa-canvas__empty">{EMPTY_CANVAS_HINT}</p> : null}
      {pendingConnection ? (
        <RelationshipTypePicker
          key={`${pendingConnection.sourceId}:${pendingConnection.targetId}:${pendingConnection.anchor.x}:${pendingConnection.anchor.y}`}
          anchor={pendingConnection.anchor}
          onChoose={choosePickerType}
          onCancel={cancelPicker}
        />
      ) : null}
    </div>
  );
}

export type CanvasViewProps = PropsWithChildren;

/**
 * The canvas surface. Render inside a CanvasProvider (preferred), or on its own,
 * in which case it provides one itself and renders `children` inside it.
 */
export function CanvasView({ children }: CanvasViewProps) {
  const host = useContext(CanvasHostContext);
  if (host) {
    return (
      <>
        <CanvasSurface />
        {children}
      </>
    );
  }
  return (
    <CanvasProvider>
      <CanvasSurface />
      {children}
    </CanvasProvider>
  );
}
