import { act, renderHook } from "@testing-library/react";
import type { FinalConnectionState } from "@xyflow/react";
import { describe, expect, it, vi } from "vitest";
import type { CanvasNode } from "./flowTypes";
import { useCanvasInteractions } from "./interactions";
import { applyTransientLayout } from "./nodeState";
import { toFlowNodes } from "./projection";
import { EMPTY_SELECTION, createFakeStore } from "./testing/fakeStore";
import { buildFixtureArchitecture } from "./testing/fixtures";

function setup() {
  const architecture = buildFixtureArchitecture();
  const store = createFakeStore(architecture);
  let nodes: CanvasNode[] = toFlowNodes(architecture, EMPTY_SELECTION);
  const updateNodes = vi.fn((updater: (current: CanvasNode[]) => CanvasNode[]) => {
    nodes = updater(nodes);
  });
  const resync = vi.fn();
  const cancelFlowConnection = vi.fn();
  const hook = renderHook(() => useCanvasInteractions({ store, resync, updateNodes, cancelFlowConnection }));
  return { architecture, store, hook, getNodes: () => nodes, resync, cancelFlowConnection };
}

const event = new MouseEvent("mousemove");
const nodeAt = (nodes: CanvasNode[], id: string) => nodes.find((node) => node.id === id)!;

describe("drag gesture", () => {
  it("moves group members live and commits ONE moveElements (one undo step)", () => {
    const { architecture, store, hook, getNodes, resync } = setup();
    const group = nodeAt(getNodes(), "grp_research");
    const start = { ...group.position };
    const moved = (dx: number, dy: number) => ({ ...group, position: { x: start.x + dx, y: start.y + dy } });

    hook.result.current.onNodeDragStart(event, group, [group]);
    act(() => hook.result.current.onNodeDrag(event, moved(15, 5), [moved(15, 5)]));
    act(() => hook.result.current.onNodeDrag(event, moved(40, 20), [moved(40, 20)]));
    expect(nodeAt(getNodes(), "cmp_discovery").position).toEqual({ x: 460, y: 320 });
    expect(nodeAt(getNodes(), "cmp_validation").position).toEqual({ x: 760, y: 320 });
    expect(nodeAt(getNodes(), "grp_research").position).toEqual({ x: start.x + 40, y: start.y + 20 });
    expect(store.commands).toHaveLength(0);

    act(() => hook.result.current.onNodeDragStop(event, moved(40, 20), [moved(40, 20)]));
    expect(store.commands).toEqual([
      {
        kind: "moveElements",
        componentPositions: { cmp_discovery: { x: 460, y: 320 }, cmp_validation: { x: 760, y: 320 } },
        groupDeltas: { grp_research: { x: 40, y: 20 } },
      },
    ]);
    expect(resync).toHaveBeenCalledTimes(1);

    store.undo();
    expect(store.getState().architecture.components).toEqual(architecture.components);
    expect(store.getState().architecture.groups).toEqual(architecture.groups);
    expect(store.getState().canUndo).toBe(false);
  });

  it("grows the group live when a member is dragged outside and keeps membership", () => {
    const { store, hook, getNodes } = setup();
    const member = nodeAt(getNodes(), "cmp_validation");
    const before = nodeAt(getNodes(), "grp_research");
    const moved = { ...member, position: { x: member.position.x + 500, y: member.position.y + 300 } };
    hook.result.current.onNodeDragStart(event, member, [member]);
    act(() => hook.result.current.onNodeDrag(event, moved, [moved]));
    const live = nodeAt(getNodes(), "grp_research");
    expect(live.width!).toBeGreaterThan(before.width!);
    expect(live.height!).toBeGreaterThan(before.height!);

    act(() => hook.result.current.onNodeDragStop(event, moved, [moved]));
    const group = store.getState().architecture.groups.find((g) => g.id === "grp_research")!;
    expect(group.memberComponentIds).toEqual(["cmp_discovery", "cmp_validation"]);
    expect(group.bounds).toEqual({ x: live.position.x, y: live.position.y, width: live.width, height: live.height });
  });

  it("dispatches nothing for a zero-delta drag", () => {
    const { store, hook, getNodes, resync } = setup();
    const node = nodeAt(getNodes(), "cmp_crm");
    hook.result.current.onNodeDragStart(event, node, [node]);
    act(() => hook.result.current.onNodeDragStop(event, node, [node]));
    expect(store.commands).toHaveLength(0);
    expect(resync).toHaveBeenCalledTimes(1);
  });

  it("moves a multi-selection by the primary delta", () => {
    const { store, hook, getNodes } = setup();
    const crm = nodeAt(getNodes(), "cmp_crm");
    const empty = nodeAt(getNodes(), "grp_empty");
    hook.result.current.onNodeDragStart(event, crm, [crm, empty]);
    const moved = { ...crm, position: { x: crm.position.x - 10, y: crm.position.y + 10 } };
    act(() => hook.result.current.onNodeDragStop(event, moved, [moved, empty]));
    expect(store.commands).toEqual([
      {
        kind: "moveElements",
        componentPositions: { cmp_crm: { x: 1050, y: 90 } },
        groupDeltas: { grp_empty: { x: -10, y: 10 } },
      },
    ]);
  });
});

describe("resize gesture", () => {
  it("commits ONE clamped resizeComponent at the end, and nothing when unchanged", () => {
    const { store, hook } = setup();
    act(() => hook.result.current.onResizeEnd("cmp_validation", { x: 720, y: 300, width: 1000.4, height: 100.6 }));
    expect(store.commands).toEqual([
      { kind: "resizeComponent", id: "cmp_validation", position: { x: 720, y: 300 }, size: { width: 480, height: 101 } },
    ]);
    const group = store.getState().architecture.groups.find((g) => g.id === "grp_research")!;
    expect(group.bounds.width).toBe(720 + 480 - 420 + 48);
    act(() => hook.result.current.onResizeEnd("cmp_validation", { x: 720, y: 300, width: 480, height: 101 }));
    expect(store.commands).toHaveLength(1);
  });
});

describe("connect gesture", () => {
  const end = (x: number, y: number) => new MouseEvent("mouseup", { clientX: x, clientY: y });
  const finalState = {} as FinalConnectionState;

  function withElementAt(element: Element | null) {
    const original = document.elementFromPoint;
    document.elementFromPoint = () => element;
    return () => {
      document.elementFromPoint = original;
    };
  }

  function componentElement(id: string) {
    const node = document.createElement("div");
    node.className = "react-flow__node react-flow__node-component";
    node.setAttribute("data-id", id);
    return node;
  }

  it("opens the picker when released on a valid handle (onConnect)", () => {
    const { hook } = setup();
    const restore = withElementAt(null);
    act(() => hook.result.current.onConnectStart(end(0, 0), { nodeId: "cmp_orch", handleId: "right", handleType: "source" }));
    expect(hook.result.current.connecting).toBe("invalid");
    act(() => hook.result.current.onConnect({ source: "cmp_orch", target: "cmp_crm", sourceHandle: "right", targetHandle: "left" }));
    act(() => hook.result.current.onConnectEnd(end(300, 200), finalState));
    restore();
    expect(hook.result.current.pendingConnection).toEqual({
      sourceId: "cmp_orch",
      targetId: "cmp_crm",
      anchor: { x: 300, y: 200 },
    });
    expect(hook.result.current.connecting).toBeNull();
  });

  it("also connects when released on another component's body", () => {
    const { hook } = setup();
    const restore = withElementAt(componentElement("cmp_search"));
    act(() => hook.result.current.onConnectStart(end(0, 0), { nodeId: "cmp_orch", handleId: "right", handleType: "source" }));
    act(() => hook.result.current.onConnectEnd(end(10, 10), finalState));
    restore();
    expect(hook.result.current.pendingConnection).toMatchObject({ sourceId: "cmp_orch", targetId: "cmp_search" });
  });

  it("opens no picker over the pane, a group or the source node", () => {
    for (const element of [null, componentElement("cmp_orch"), componentElement("grp_research")]) {
      const { hook } = setup();
      const restore = withElementAt(element);
      act(() => hook.result.current.onConnectStart(end(0, 0), { nodeId: "cmp_orch", handleId: "right", handleType: "source" }));
      act(() => hook.result.current.onConnectEnd(end(10, 10), finalState));
      restore();
      expect(hook.result.current.pendingConnection).toBeNull();
    }
  });

  it("Escape during the drag cancels it without reaching the editor shortcuts", () => {
    const { hook, cancelFlowConnection } = setup();
    const shell = vi.fn();
    document.addEventListener("keydown", shell);
    const restore = withElementAt(componentElement("cmp_search"));
    act(() => hook.result.current.onConnectStart(end(0, 0), { nodeId: "cmp_orch", handleId: "right", handleType: "source" }));
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    expect(hook.result.current.connecting).toBe("cancelled");
    expect(cancelFlowConnection).toHaveBeenCalledTimes(1);
    act(() => hook.result.current.onConnect({ source: "cmp_orch", target: "cmp_search", sourceHandle: null, targetHandle: null }));
    act(() => hook.result.current.onConnectEnd(end(10, 10), finalState));
    restore();
    document.removeEventListener("keydown", shell);
    expect(shell).not.toHaveBeenCalled();
    expect(hook.result.current.pendingConnection).toBeNull();
    expect(hook.result.current.connecting).toBeNull();
  });
});

describe("applyTransientLayout", () => {
  it("writes positions and group bounds, leaving other nodes untouched", () => {
    const nodes = toFlowNodes(buildFixtureArchitecture(), EMPTY_SELECTION);
    const next = applyTransientLayout(nodes, {
      componentPositions: { cmp_crm: { x: 1, y: 2 } },
      groupBounds: { grp_empty: { x: 3, y: 4, width: 50, height: 60 } },
    });
    expect(nodeAt(next, "cmp_crm").position).toEqual({ x: 1, y: 2 });
    expect(nodeAt(next, "grp_empty")).toMatchObject({ position: { x: 3, y: 4 }, width: 50, height: 60 });
    expect(nodeAt(next, "cmp_orch")).toBe(nodeAt(nodes, "cmp_orch"));
  });
});
