import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { EditorStore } from "../editor/storeTypes";
import { ToastProvider, useToast } from "../ui/Toast";
import EditorRoute, { type EditorRouteProps } from "./EditorRoute";
import { createMemoryRepository } from "./placeholders/persistence";
import { installDialogPolyfill, makeFile } from "./testUtils";

const stores = vi.hoisted(() => [] as EditorStore[]);

vi.mock("../editor/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../editor/store")>();
  return {
    ...actual,
    createEditorStore: (...args: Parameters<typeof actual.createEditorStore>) => {
      const store = actual.createEditorStore(...args);
      stores.push(store);
      return store;
    },
  };
});

beforeAll(() => {
  installDialogPolyfill();
  // React Flow measures its container; jsdom has no ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const libraryServices = {
  openTabSession: () => ({ close: () => undefined }),
  subscribeToRepositoryChanges: () => () => undefined,
  requestPersistentStorage: () => undefined,
} as unknown as EditorRouteProps["libraryServices"];
const noop = () => undefined;

/** Like AppRoutes: a toast consumer that renders the default (non-injected) editor route. */
function Host({ repository }: { repository: EditorRouteProps["repository"] }) {
  useToast();
  return (
    <Suspense fallback={null}>
      <EditorRoute
        id="arch_route"
        repository={repository}
        libraryServices={libraryServices}
        onOpenFailed={noop}
        onLeave={noop}
        onOpenArchitecture={noop}
      />
    </Suspense>
  );
}

describe("default EditorRoute", () => {
  it("keeps the same store and its undoable deletion while the Undo toast is shown", async () => {
    const repository = createMemoryRepository();
    repository.seed({
      status: "ok",
      file: makeFile({
        id: "arch_route",
        components: [
          { id: "cmp_a", type: "agent", name: "Alpha", position: { x: 0, y: 0 } },
          { id: "cmp_b", type: "tool", name: "Bravo", position: { x: 400, y: 0 } },
        ],
      }),
    });
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Host repository={repository} />
      </ToastProvider>,
    );
    // The default route lazily loads the real editor modules.
    await screen.findByRole("textbox", { name: "Architecture name" }, { timeout: 10_000 });
    expect(stores).toHaveLength(1);
    const store = stores[0]!;

    act(() => store.setSelection({ componentIds: ["cmp_a"], relationshipIds: [], groupIds: [] }));
    const toolbar = document.querySelector<HTMLElement>(".sa-toolbar")!;
    await user.click(within(toolbar).getByRole("button", { name: "Delete" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(document.querySelector(".sa-toast")).toBeInTheDocument());
    const toast = document.querySelector<HTMLElement>(".sa-toast")!;
    expect(within(toast).getByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(stores).toHaveLength(1);
    expect(store.getState().canUndo).toBe(true);
    expect(store.getState().architecture.components.map((c) => c.id)).toEqual(["cmp_b"]);

    await user.click(within(toast).getByRole("button", { name: "Undo" }));
    expect(store.getState().architecture.components.map((c) => c.id)).toEqual(["cmp_a", "cmp_b"]);
    expect(document.querySelector(".sa-toast")).not.toBeInTheDocument();
    expect(stores).toHaveLength(1);
  });
});
