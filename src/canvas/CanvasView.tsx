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
  useConnection,
  useReactFlow,
  useStore,
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
import { CanvasApiContext, computeDiagramBounds, type CanvasApi } from "./canvasApi";
import { activeTargetPort, addRelationshipAndSelect } from "./connection";
import { isPortSide } from "../domain/ports";
import { ConnectionLine } from "./ConnectionLine";
import { diagramLabelInputFromFlow, layoutDiagramLabels } from "./edgeLabels";
import { EdgeLabelLayoutContext, RelationshipEdge } from "./edges/RelationshipEdge";
import { internalNodeRect, layoutRelationship, type CubicEdgeGeometry } from "./floating";
import {
  COMPONENT_NODE_TYPE,
  GROUP_NODE_TYPE,
  RELATIONSHIP_EDGE_TYPE,
  nodeComponent,
  type CanvasNode,
  type RelationshipFlowEdge,
} from "./flowTypes";
import { useCanvasInteractions } from "./interactions";
import { CanvasNodeCallbacksContext, ConnectHintContext, NO_CONNECT_HINT, type ConnectHint } from "./nodeContext";
import { isAppliedNodeChange, mergeProjectedNodes } from "./nodeState";
import { ComponentNode } from "./nodes/ComponentNode";
import { GroupNode } from "./nodes/GroupNode";
import { toFlowEdges, toFlowNodes } from "./projection";
import { handlePaletteDragOver, handlePaletteDrop } from "./paletteDrop";
import { RelationshipTypePicker } from "./RelationshipTypePicker";
import { CONNECTION_RADIUS, absolutePortAnchor, shapeKindFor } from "./shapes";
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
      getDiagramBounds: () => {
        const nodes = flow.getNodes();
        const nodesBounds = nodes.length ? flow.getNodesBounds(nodes) : null;
        const edges: { geometry: CubicEdgeGeometry; label?: string }[] = [];
        for (const edge of flow.getEdges()) {
          const data = edge.data;
          const source = flow.getInternalNode(edge.source);
          const target = flow.getInternalNode(edge.target);
          if (!data || !source || !target) continue;
          const kindOf = (node: typeof source) => {
            const component = nodeComponent(node);
            return component ? shapeKindFor(component) : "rounded";
          };
          const geometry = layoutRelationship({
            relationship: data.relationship,
            sourceRect: internalNodeRect(source),
            targetRect: internalNodeRect(target),
            sourceKind: kindOf(source),
            targetKind: kindOf(target),
            parallelOffset: data.parallelOffset,
            labelPosition: data.labelPosition,
          });
          edges.push({ geometry, label: typeof edge.label === "string" ? edge.label : undefined });
        }
        const bounds = computeDiagramBounds(nodesBounds && { x: nodesBounds.x, y: nodesBounds.y, width: nodesBounds.width, height: nodesBounds.height }, edges);
        return bounds;
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
// Edge label layout (UI_V2_REFINEMENT.md 3.2)
// ---------------------------------------------------------------------------

/**
 * Lays out every relationship label once per render, from React Flow's live
 * internal node rects (moves and resizes) and edges (added, removed, relabelled),
 * and hands each edge its placement through EdgeLabelLayoutContext. It
 * subscribes to the store on its own, so only it and the edges re-render; the
 * canvas element passed as `children` is not re-created.
 */
function EdgeLabelLayoutProvider({ children }: PropsWithChildren) {
  const flowStore = useStoreApi<CanvasNode, RelationshipFlowEdge>();
  const nodes = useStore((state) => state.nodes);
  const edges = useStore((state) => state.edges as RelationshipFlowEdge[]);
  const placements = useMemo(() => {
    const { nodeLookup } = flowStore.getState();
    const internalNodes = nodes.flatMap((node) => {
      const internal = nodeLookup.get(node.id);
      return internal ? [internal] : [];
    });
    return layoutDiagramLabels(diagramLabelInputFromFlow(internalNodes, edges, (id) => nodeLookup.get(id)));
  }, [flowStore, nodes, edges]);
  return <EdgeLabelLayoutContext.Provider value={placements}>{children}</EdgeLabelLayoutContext.Provider>;
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

  // ---- Connection hover hint (UI v2 7.1, 8.2) -------------------------------
  // The candidate target and the port that would be used: the snapped port
  // (React Flow `toHandle`) or, for a body hover, autoPortFor(T, source anchor).
  const fromHandle = useConnection((connection) => connection.fromHandle);
  const toHandle = useConnection((connection) => connection.toHandle);
  const connectHint = ((): ConnectHint => {
    if (interactions.connecting === null || interactions.connecting === "cancelled" || !fromHandle) {
      return NO_CONNECT_HINT;
    }
    const { nodeLookup } = flowStore.getState();
    const fromNode = nodeLookup.get(fromHandle.nodeId);
    const fromComponent = nodeComponent(fromNode);
    if (!fromNode || !fromComponent || !isPortSide(fromHandle.id)) return NO_CONNECT_HINT;
    const snappedNode =
      toHandle && toHandle.nodeId !== fromHandle.nodeId ? nodeLookup.get(toHandle.nodeId) : undefined;
    const snapped = nodeComponent(snappedNode) && isPortSide(toHandle?.id) ? { node: snappedNode, side: toHandle.id } : null;
    const targetNode = snapped
      ? snapped.node
      : interactions.connectTargetId
        ? nodeLookup.get(interactions.connectTargetId)
        : undefined;
    const targetComponent = nodeComponent(targetNode);
    if (!targetNode || !targetComponent) return NO_CONNECT_HINT;
    const sourceAnchor = absolutePortAnchor(
      shapeKindFor(fromComponent),
      internalNodeRect(fromNode),
      fromHandle.id,
    );
    return {
      targetId: targetNode.id,
      activeSide: activeTargetPort({
        snappedSide: snapped ? snapped.side : null,
        targetKind: shapeKindFor(targetComponent),
        targetRect: internalNodeRect(targetNode),
        sourceAnchor,
      }),
    };
  })();

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
      addRelationshipAndSelect(store, type, pendingConnection.sourceId, pendingConnection.targetId, pendingConnection.pins);
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
        <ConnectHintContext.Provider value={connectHint}>
        <EdgeLabelLayoutProvider>
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
          connectionRadius={CONNECTION_RADIUS}
          connectionLineType={ConnectionLineType.Bezier}
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
        </EdgeLabelLayoutProvider>
        </ConnectHintContext.Provider>
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
