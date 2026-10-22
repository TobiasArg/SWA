import { act, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { useReactFlow } from "@xyflow/react";
import { componentRect } from "../domain/geometry";
import { EditorProvider } from "../editor/context";
import { useCanvasApi } from "./canvasApi";
import { CanvasView, EMPTY_CANVAS_HINT } from "./CanvasView";
import { createFakeStore, type FakeEditorStore } from "./testing/fakeStore";
import { PALETTE_DRAG_MIME } from "../palette/paletteItems";
import { buildFixtureArchitecture, emptyArchitecture } from "./testing/fixtures";

// Records React Flow's setCenter calls while still running the real one (QF4).
const setCenterSpy = vi.hoisted(() => vi.fn());
vi.mock("@xyflow/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xyflow/react")>();
  const wrapped = new WeakMap<object, ReturnType<typeof actual.useReactFlow>>();
  return {
    ...actual,
    useReactFlow: () => {
      const flow = actual.useReactFlow();
      let spied = wrapped.get(flow);
      if (!spied) {
        spied = {
          ...flow,
          setCenter: (...args: Parameters<typeof flow.setCenter>) => {
            setCenterSpy(...args);
            return flow.setCenter(...args);
          },
        };
        wrapped.set(flow, spied);
      }
      return spied;
    },
  };
});

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query === "(prefers-reduced-motion: reduce)",
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
}

afterEach(() => {
  setCenterSpy.mockClear();
  vi.unstubAllGlobals();
});

beforeAll(() => {
  // jsdom lacks the layout APIs React Flow touches.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  globalThis.DOMMatrixReadOnly ??= class {
    m22 = 1;
    constructor() {}
  } as unknown as typeof DOMMatrixReadOnly;
});

function renderCanvas(store: FakeEditorStore, children?: React.ReactNode) {
  return render(
    <EditorProvider store={store}>
      <div style={{ width: 800, height: 600 }}>
        <CanvasView>{children}</CanvasView>
      </div>
    </EditorProvider>,
  );
}

function FlowProbe({ onFlow }: { onFlow: (flow: ReturnType<typeof useReactFlow>) => void }) {
  onFlow(useReactFlow());
  return null;
}

function ApiProbe({ onApi }: { onApi: (api: ReturnType<typeof useCanvasApi>) => void }) {
  onApi(useCanvasApi());
  return null;
}

describe("CanvasView", () => {
  it("renders component and group nodes from the store with accessible labels", () => {
    const store = createFakeStore(buildFixtureArchitecture());
    const { container } = renderCanvas(store);
    expect(screen.getByLabelText("Agent: Discovery Agent. Finds new leads.")).toHaveAttribute(
      "aria-roledescription",
      "component",
    );
    expect(screen.getByText("Research Team")).toBeInTheDocument();
    expect(screen.getByText("2 MEMBERS")).toBeInTheDocument();
    expect(screen.getByText("EMPTY")).toBeInTheDocument();
    expect(container.querySelector('[data-type="agent"][data-subtype="orchestrator"]')).not.toBeNull();
    expect(container.querySelector(".react-flow__node-group-container .react-flow__handle")).toBeNull();
    expect(container.querySelectorAll(".react-flow__node-component .react-flow__handle")).toHaveLength(7 * 4);
    expect(screen.queryByText(EMPTY_CANVAS_HINT)).toBeNull();
  });

  it("shows the empty-canvas hint when there are no components", () => {
    renderCanvas(createFakeStore(emptyArchitecture()));
    expect(screen.getByText(EMPTY_CANVAS_HINT)).toBeInTheDocument();
  });

  it("selects through the store on click and keyboard, and clears on pane click", () => {
    const store = createFakeStore(buildFixtureArchitecture());
    const { container } = renderCanvas(store);
    const node = container.querySelector<HTMLElement>('.react-flow__node[data-id="cmp_crm"]')!;

    fireEvent.click(node);
    expect(store.getState().selection.componentIds).toEqual(["cmp_crm"]);

    const group = container.querySelector<HTMLElement>('.react-flow__node[data-id="grp_research"]')!;
    fireEvent.keyDown(group, { key: "Enter" });
    expect(store.getState().selection).toEqual({ componentIds: [], relationshipIds: [], groupIds: ["grp_research"] });

    fireEvent.click(container.querySelector(".react-flow__pane")!);
    expect(store.getState().selection).toEqual({ componentIds: [], relationshipIds: [], groupIds: [] });
  });

  it("reflects store selection and content changes", () => {
    const store = createFakeStore(buildFixtureArchitecture());
    const { container } = renderCanvas(store);
    act(() => store.setSelection({ componentIds: ["cmp_orch"], relationshipIds: [], groupIds: [] }));
    expect(container.querySelector('.react-flow__node[data-id="cmp_orch"]')).toHaveClass("selected");
    act(() => {
      store.dispatch({
        kind: "addComponent",
        component: { id: "cmp_new", type: "tool", name: "New Tool", position: { x: 0, y: 0 } },
      });
    });
    expect(screen.getByLabelText("Tool: New Tool.")).toBeInTheDocument();
  });

  it("provides the CanvasApi to children", () => {
    const store = createFakeStore(buildFixtureArchitecture());
    let api: ReturnType<typeof useCanvasApi> | null = null;
    renderCanvas(store, <ApiProbe onApi={(value) => (api = value)} />);
    expect(api).not.toBeNull();
    expect(api!.getViewportElement()).toHaveClass("react-flow__viewport");
    const bounds = api!.getNodesBounds();
    expect(bounds.x).toBe(80);
    expect(bounds.y).toBe(80);
    const diagram = api!.getDiagramBounds();
    expect(diagram.x).toBeLessThanOrEqual(bounds.x);
    expect(diagram.y).toBeLessThanOrEqual(bounds.y);
    expect(diagram.x + diagram.width).toBeGreaterThanOrEqual(bounds.x + bounds.width);
    expect(diagram.y + diagram.height).toBeGreaterThanOrEqual(bounds.y + bounds.height);
  });

  it("adds a dropped palette item at the drop point and accepts the drag as a copy", () => {
    // A stored viewport (no fitView): flow = (client - pan) / zoom.
    const store = createFakeStore(emptyArchitecture({ canvas: { viewport: { x: 20, y: 10, zoom: 1 } } }));
    const { container } = renderCanvas(store);
    const flow = container.querySelector<HTMLElement>(".react-flow")!;
    const data: Record<string, string> = { [PALETTE_DRAG_MIME]: JSON.stringify({ type: "decision" }) };
    const dataTransfer = { types: Object.keys(data), getData: (f: string) => data[f] ?? "", dropEffect: "none" };

    const over = fireEvent.dragOver(flow, { dataTransfer });
    expect(over).toBe(false); // default prevented → drop allowed
    expect(dataTransfer.dropEffect).toBe("copy");

    // jsdom has no DragEvent, so the client coordinates are attached by hand.
    const drop = createEvent.drop(flow, { dataTransfer });
    Object.defineProperties(drop, { clientX: { value: 120 }, clientY: { value: 80 } });
    fireEvent(flow, drop);
    expect(store.commands).toHaveLength(1);
    const [component] = store.getState().architecture.components;
    expect(component).toMatchObject({ type: "decision", name: "Decision", position: { x: 100, y: 70 } });
    expect(store.getState().selection.componentIds).toEqual([component!.id]);
  });

  describe("revealComponent (Quick Find, QF4)", () => {
    function renderWithApi(zoom: number) {
      const store = createFakeStore(buildFixtureArchitecture({ canvas: { viewport: { x: 30, y: 40, zoom } } }));
      let api: ReturnType<typeof useCanvasApi> | null = null;
      let flow: ReturnType<typeof useReactFlow> | null = null;
      renderCanvas(
        store,
        <>
          <ApiProbe onApi={(value) => (api = value)} />
          <FlowProbe onFlow={(value) => (flow = value)} />
        </>,
      );
      return { store, api: () => api!, flowViewport: () => flow!.getViewport() };
    }
    const crm = componentRect(buildFixtureArchitecture().components.find((c) => c.id === "cmp_crm")!);
    const center = { x: crm.x + crm.width / 2, y: crm.y + crm.height / 2 };

    it("centers the component at zoom 1 without animation under reduced motion, then stores the viewport", async () => {
      stubReducedMotion(true);
      const { store, api, flowViewport } = renderWithApi(0.5);
      let revealed: boolean | undefined;
      await act(async () => {
        revealed = await api().revealComponent("cmp_crm");
      });
      expect(revealed).toBe(true);
      expect(setCenterSpy).toHaveBeenCalledTimes(1);
      expect(setCenterSpy).toHaveBeenCalledWith(center.x, center.y, { zoom: 1, duration: 0 });
      // The settled React Flow viewport is stored explicitly, whatever onMoveEnd does.
      const settled = flowViewport();
      expect(settled.zoom).toBe(1);
      expect(store.viewports.at(-1)).toEqual(settled);
      expect(store.getState().architecture.canvas?.viewport).toEqual(settled);
      // Revealing is not a content change and does not select.
      expect(store.commands).toHaveLength(0);
      expect(store.selections).toHaveLength(0);
    });

    it("never zooms out and animates for 200 ms without reduced motion", async () => {
      stubReducedMotion(false);
      const { store, api } = renderWithApi(1.5);
      await act(async () => {
        await api().revealComponent("cmp_crm");
      });
      expect(setCenterSpy).toHaveBeenCalledWith(center.x, center.y, { zoom: 1.5, duration: 200 });
      expect(store.viewports.at(-1)?.zoom).toBe(1.5);
    });

    it("keeps the maximum zoom when already fully zoomed in", async () => {
      stubReducedMotion(true);
      const { store, api } = renderWithApi(2);
      await act(async () => {
        await api().revealComponent("cmp_crm");
      });
      expect(setCenterSpy).toHaveBeenCalledWith(center.x, center.y, { zoom: 2, duration: 0 });
      expect(store.viewports.at(-1)?.zoom).toBe(2);
    });

    it("resolves false for an unknown node and leaves the viewport alone", async () => {
      stubReducedMotion(true);
      const { store, api } = renderWithApi(0.5);
      const before = store.viewports.length;
      let revealed: boolean | undefined;
      await act(async () => {
        revealed = await api().revealComponent("cmp_missing");
      });
      expect(revealed).toBe(false);
      expect(setCenterSpy).not.toHaveBeenCalled();
      expect(store.viewports).toHaveLength(before);
    });

    it("rejects group ids: only components can be revealed", async () => {
      stubReducedMotion(true);
      const { api } = renderWithApi(0.5);
      await expect(api().revealComponent("grp_research")).resolves.toBe(false);
      expect(setCenterSpy).not.toHaveBeenCalled();
    });
  });
});
