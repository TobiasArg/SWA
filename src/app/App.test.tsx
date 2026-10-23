import { act, render, screen, waitFor, within } from "@testing-library/react";
import { config as zodConfig, z } from "zod";
import { lazy, Suspense } from "react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SaveController } from "../persistence/types";
import App, {
  EDITOR_LOAD_FAILED_MESSAGE,
  EDITOR_LOAD_FAILED_TITLE,
  EditorLoadBoundary,
  OPEN_FAILED_MESSAGE,
  STORAGE_UNAVAILABLE_MESSAGE,
} from "./App";
import { placeholderModules, placeholderServices } from "./defaultServices";
import { LEAVE_SAVE_FAILED_MESSAGE, TAB_CONFLICT_MESSAGE } from "./EditorScreen";
import { createMemoryRepository, type MemoryRepository } from "./placeholders/persistence";
import { editorHref } from "./router";
import type { AppServices } from "./services";
import { installDialogPolyfill, jsonFile, makeFile } from "./testUtils";

beforeAll(installDialogPolyfill);

let repository: MemoryRepository;

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "#/");
  repository = createMemoryRepository();
  repository.seed({
    status: "ok",
    file: makeFile({
      id: "arch_1",
      name: "Lead Hunting Engine",
      components: [{ id: "cmp_1", type: "agent", name: "Discovery Agent", position: { x: 0, y: 0 } }],
    }),
  });
});

function renderApp(overrides: Partial<AppServices> = {}) {
  const services: AppServices = {
    ...placeholderServices,
    openRepository: async () => repository,
    exportArchitectureJson: vi.fn(),
    exportArchitectureMarkdown: vi.fn(),
    exportPng: vi.fn(async () => undefined),
    requestPersistentStorage: vi.fn(),
    ...overrides,
  };
  render(<App services={services} modules={placeholderModules} />);
  return services;
}

async function openEditor(id = "arch_1") {
  act(() => {
    window.location.hash = editorHref(id);
  });
  return screen.findByRole("textbox", { name: "Architecture name" });
}

function key(init: KeyboardEventInit, target: Element = document.body) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  });
}

describe("App shell", () => {
  it("keeps Zod validation on the CSP-safe interpreter without probing Function", () => {
    expect(zodConfig().jitless).toBe(true);

    const dynamicCode = vi.fn();
    vi.stubGlobal("Function", dynamicCode);
    try {
      expect(z.object({ value: z.string() }).safeParse({ value: "ok" }).success).toBe(true);
      expect(dynamicCode).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("shows the reload fallback when a lazy editor import rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const user = userEvent.setup();
    const reload = vi.fn();
    const FailedEditor = lazy(async () => {
      await Promise.reject(new Error("chunk load failed"));
      return { default: () => null };
    });

    render(
      <EditorLoadBoundary reload={reload}>
        <Suspense fallback={<p>Loading editor…</p>}>
          <FailedEditor />
        </Suspense>
      </EditorLoadBoundary>,
    );

    expect(await screen.findByRole("heading", { name: EDITOR_LOAD_FAILED_TITLE })).toBeInTheDocument();
    expect(screen.getByText(EDITOR_LOAD_FAILED_MESSAGE)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reload" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("shows the full-page message when storage is unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    renderApp({ openRepository: () => Promise.reject(new Error("blocked")) });
    expect(await screen.findByText(STORAGE_UNAVAILABLE_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("routes between the library and the editor", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole("link", { name: "Lead Hunting Engine" }));
    expect(await screen.findByRole("textbox", { name: "Architecture name" })).toHaveValue("Lead Hunting Engine");
    expect(screen.getByRole("complementary", { name: "Component library" })).toBeInTheDocument();
    expect(screen.getByRole("main", { name: "Canvas" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Inspector" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Library" }));
    expect(await screen.findByRole("heading", { name: "Architectures" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#/");
  });

  it("returns to the library with a toast for unknown or damaged architectures", async () => {
    repository.seed({ status: "damaged", id: "arch_bad", name: "Bad", issues: [], raw: {} });
    renderApp();
    await screen.findByRole("link", { name: "Lead Hunting Engine" });

    act(() => {
      window.location.hash = editorHref("arch_missing");
    });
    expect(await screen.findByText(OPEN_FAILED_MESSAGE)).toBeInTheDocument();
    expect(window.location.hash).toBe("#/");

    act(() => {
      window.location.hash = editorHref("arch_bad");
    });
    await waitFor(() => expect(screen.getAllByText(OPEN_FAILED_MESSAGE)).toHaveLength(2));
    expect(screen.getByRole("heading", { name: "Architectures" })).toBeInTheDocument();
  });

  it("creates an architecture that opens in the editor and is listed in the library", async () => {
    const user = userEvent.setup();
    const services = renderApp();
    await user.click(await screen.findByRole("button", { name: "New architecture" }));
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Support Swarm{Enter}");
    expect(await screen.findByRole("textbox", { name: "Architecture name" })).toHaveValue("Support Swarm");
    expect(services.requestPersistentStorage).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Library" }));
    expect(await screen.findByRole("link", { name: "Support Swarm" })).toBeInTheDocument();
  });

  it("flushes pending changes before leaving the editor", async () => {
    const user = userEvent.setup();
    renderApp();
    const name = await openEditor();
    await user.clear(name);
    await user.type(name, "Renamed engine{Enter}");
    await user.click(screen.getByRole("button", { name: "Library" }));

    expect(await screen.findByRole("link", { name: "Renamed engine" })).toBeInTheDocument();
    const record = await repository.get("arch_1");
    expect(record?.status === "ok" && record.file.architecture.name).toBe("Renamed engine");
  });

  it("stays in the editor when the final save fails", async () => {
    const user = userEvent.setup();
    const failing: SaveController = {
      getStatus: () => ({ status: "error", error: "Quota exceeded" }),
      subscribe: () => () => undefined,
      flush: async () => false,
      retry: vi.fn(),
      dispose: vi.fn(),
    };
    renderApp({ startAutosave: () => failing });
    await openEditor();
    await user.click(screen.getByRole("button", { name: "Library" }));
    expect(await screen.findByText(LEAVE_SAVE_FAILED_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Architecture name" })).toBeInTheDocument();
  });

  it("wires keyboard shortcuts to the editor: delete with undo toast, undo and redo", async () => {
    const user = userEvent.setup();
    renderApp();
    await openEditor();
    await user.click(screen.getByRole("button", { name: /Discovery Agent/ }));

    key({ key: "Delete" });
    const confirm = screen.getByRole("dialog", { name: "Delete 1 component?" });
    expect(screen.getByRole("button", { name: /Discovery Agent/ })).toBeInTheDocument();
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findAllByText("Deleted Discovery Agent.")).toHaveLength(2); // toast + live region
    const toast = document.querySelector<HTMLElement>(".sa-toast")!;
    expect(within(toast).getByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Discovery Agent/ })).not.toBeInTheDocument();

    key({ key: "z", ctrlKey: true, metaKey: true });
    expect(await screen.findByRole("button", { name: /Discovery Agent/ })).toBeInTheDocument();

    key({ key: "z", ctrlKey: true, metaKey: true, shiftKey: true });
    await waitFor(() => expect(screen.queryByRole("button", { name: /Discovery Agent/ })).not.toBeInTheDocument());

    await user.click(within(screen.getByRole("banner")).getByRole("button", { name: "Undo" }));
    expect(await screen.findByRole("button", { name: /Discovery Agent/ })).toBeInTheDocument();
  });

  it("shows the tab conflict banner when another tab has the architecture open", async () => {
    renderApp({
      openTabSession: (_id, onAlsoOpen) => {
        queueMicrotask(onAlsoOpen);
        return { close: vi.fn() };
      },
    });
    await openEditor();
    expect(await screen.findByText(TAB_CONFLICT_MESSAGE)).toBeInTheDocument();
  });

  it("imports from the editor toolbar: invalid files show issues, valid files open", async () => {
    const user = userEvent.setup();
    renderApp();
    await openEditor();
    const input = document.querySelector<HTMLInputElement>(".sa-toolbar input[type='file']")!;

    await user.upload(input, jsonFile({ schemaVersion: 3, architecture: {} }));
    const dialog = await screen.findByRole("dialog", { name: "This file can't be imported" });
    expect(within(dialog).getByText(/format version 3/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Close" }));

    await user.upload(input, jsonFile(makeFile({ id: "arch_2", name: "Imported Swarm" })));
    await waitFor(() => expect(window.location.hash).toBe(editorHref("arch_2")));
    expect(await screen.findByRole("textbox", { name: "Architecture name" })).toHaveValue("Imported Swarm");
  });

  it("exports JSON from the in-memory state and reports PNG failures", async () => {
    const user = userEvent.setup();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const services = renderApp({ exportPng: vi.fn(async () => Promise.reject(new Error("boom"))) });
    await openEditor();

    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(screen.getByRole("menuitem", { name: "JSON file" }));
    expect(services.exportArchitectureJson).toHaveBeenCalledWith(expect.objectContaining({ id: "arch_1" }));

    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(screen.getByRole("menuitem", { name: "Markdown document" }));
    expect(services.exportArchitectureMarkdown).toHaveBeenCalledWith(
      expect.objectContaining({ id: "arch_1", name: "Lead Hunting Engine" }),
    );

    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(screen.getByRole("menuitem", { name: "PNG image" }));
    expect(
      await screen.findByText("Image export failed. Try zooming out or reducing the diagram size."),
    ).toBeInTheDocument();
  });

  it("collapses panels and remembers the preference", async () => {
    const user = userEvent.setup();
    renderApp();
    await openEditor();

    const paletteToggle = screen.getByRole("button", { name: "Collapse component library" });
    expect(paletteToggle).toHaveAttribute("aria-expanded", "true");
    await user.click(paletteToggle);
    expect(screen.getByRole("button", { name: "Expand component library" })).toHaveAttribute("aria-expanded", "false");
    expect(window.localStorage.getItem("sa:ui:palette-collapsed")).toBe("1");

    await user.click(screen.getByRole("button", { name: "Collapse inspector" }));
    expect(screen.queryByRole("complementary", { name: "Inspector" })).not.toBeInTheDocument();
    expect(window.localStorage.getItem("sa:ui:inspector-collapsed")).toBe("1");
  });
});
