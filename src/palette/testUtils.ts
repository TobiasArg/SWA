import { vi } from "vitest";
import type { CanvasApi } from "../canvas/canvasApi";
import type { Architecture, Component } from "../domain/types";
import type { EditorState, EditorStore } from "../editor/storeTypes";

export function makeArchitecture(components: Component[] = []): Architecture {
  return {
    id: "arch_test",
    name: "Test",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    components,
    relationships: [],
    groups: [],
  };
}

export function makeStoreDouble(components: Component[] = []) {
  const state: EditorState = {
    architecture: makeArchitecture(components),
    selection: { componentIds: [], relationshipIds: [], groupIds: [] },
    canUndo: false,
    canRedo: false,
    revision: 0,
    contentRevision: 0,
  };
  const store = {
    getState: vi.fn(() => state),
    subscribe: vi.fn(() => () => {}),
    dispatch: vi.fn<EditorStore["dispatch"]>(() => ({ ok: true })),
    undo: vi.fn(),
    redo: vi.fn(),
    breakCoalescing: vi.fn(),
    setSelection: vi.fn(),
    setViewport: vi.fn(),
    renameArchitecture: vi.fn(),
    setArchitectureDescription: vi.fn(),
  } satisfies EditorStore;
  return store;
}

export function makeCanvasApiDouble(rect: { left: number; top: number; width: number; height: number }) {
  const flow = document.createElement("div");
  flow.className = "react-flow";
  const viewport = document.createElement("div");
  flow.appendChild(viewport);
  flow.getBoundingClientRect = () =>
    ({ ...rect, x: rect.left, y: rect.top, right: rect.left + rect.width, bottom: rect.top + rect.height, toJSON: () => ({}) }) as DOMRect;

  let pan = { x: 100, y: 50 };
  const api = {
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    fitView: vi.fn(),
    screenToFlowPosition: vi.fn((p: { x: number; y: number }) => ({ x: p.x - pan.x, y: p.y - pan.y })),
    getViewportElement: vi.fn<() => HTMLElement | null>(() => viewport),
    getNodesBounds: vi.fn(() => ({ x: 0, y: 0, width: 0, height: 0 })),
  } satisfies CanvasApi;
  return {
    api,
    setPan(next: { x: number; y: number }) {
      pan = next;
    },
  };
}
