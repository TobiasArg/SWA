import { act, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { EditorProvider } from "../editor/context";
import { useCanvasApi } from "./canvasApi";
import { CanvasView, EMPTY_CANVAS_HINT } from "./CanvasView";
import { createFakeStore, type FakeEditorStore } from "./testing/fakeStore";
import { PALETTE_DRAG_MIME } from "../palette/paletteItems";
import { buildFixtureArchitecture, emptyArchitecture } from "./testing/fixtures";

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
});
