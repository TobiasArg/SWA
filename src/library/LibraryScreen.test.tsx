import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { placeholderServices } from "../app/defaultServices";
import { createMemoryRepository, type MemoryRepository } from "../app/placeholders/persistence";
import type { AppServices } from "../app/services";
import { installDialogPolyfill, jsonFile, makeFile } from "../app/testUtils";
import type { Repository } from "../persistence/types";
import { ToastProvider } from "../ui/Toast";
import { BACKUP_NOTICE, LibraryScreen } from "./LibraryScreen";

beforeAll(installDialogPolyfill);

beforeEach(() => {
  window.localStorage.clear();
});

function renderLibrary(repository: Repository, overrides: Partial<AppServices> = {}) {
  const services: AppServices = {
    ...placeholderServices,
    exportArchitectureJson: vi.fn(),
    exportArchitectureMarkdown: vi.fn(),
    exportRawJson: vi.fn(),
    requestPersistentStorage: vi.fn(),
    ...overrides,
  };
  const onOpen = vi.fn();
  render(
    <ToastProvider>
      <LibraryScreen
        repository={repository}
        services={services}
        editorHref={(id) => `#/a/${id}`}
        onOpen={onOpen}
        now={() => "2026-10-21T12:00:00.000Z"}
      />
    </ToastProvider>,
  );
  return { services, onOpen };
}

function seeded(): MemoryRepository {
  const repository = createMemoryRepository();
  repository.seed({ status: "ok", file: makeFile({ id: "arch_old", name: "Old", updatedAt: "2026-01-01T00:00:00.000Z" }) });
  repository.seed({
    status: "ok",
    file: makeFile({
      id: "arch_new",
      name: "New",
      updatedAt: "2026-10-20T00:00:00.000Z",
      components: [{ id: "c1", type: "agent", name: "Agent", position: { x: 0, y: 0 } }],
    }),
  });
  return repository;
}

describe("LibraryScreen", () => {
  it("shows skeleton rows while loading, then the empty state", async () => {
    let resolve: (value: []) => void = () => undefined;
    const repository = createMemoryRepository();
    repository.list = () => new Promise((r) => (resolve = r));
    renderLibrary(repository);

    expect(screen.getByText("Loading architectures…")).toBeInTheDocument();
    expect(screen.getByRole("table")).toHaveAttribute("aria-busy", "true");

    resolve([]);
    expect(await screen.findByRole("heading", { name: "No architectures yet." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New architecture" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import JSON" })).toBeInTheDocument();
  });

  it("lists architectures by last edit with links, relative time and counts", async () => {
    renderLibrary(seeded());
    const links = await screen.findAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["New", "Old"]);
    expect(links[0]).toHaveAttribute("href", "#/a/arch_new");
    const firstRow = links[0]!.closest("tr")!;
    expect(within(firstRow).getAllByText("1 component · 0 relationships · 0 groups")).not.toHaveLength(0);
    expect(within(firstRow).getByText(/day|yesterday/i)).toHaveAttribute("datetime", "2026-10-20T00:00:00.000Z");
  });

  it("creates a new architecture from the dialog and opens it", async () => {
    const user = userEvent.setup();
    const repository = createMemoryRepository();
    const { onOpen, services } = renderLibrary(repository);

    await user.click(await screen.findByRole("button", { name: "New architecture" }));
    const input = screen.getByLabelText("Name");
    expect(input).toHaveValue("Untitled architecture");

    await user.clear(input);
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(screen.getByText("Name is required")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");

    await user.type(input, "Support Swarm");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(onOpen).toHaveBeenCalledTimes(1));
    const [record] = await repository.list();
    expect(record?.status === "ok" && record.file.architecture.name).toBe("Support Swarm");
    expect(onOpen).toHaveBeenCalledWith(record?.status === "ok" ? record.file.architecture.id : "");
    expect(services.requestPersistentStorage).toHaveBeenCalled();
  });

  it("renames and duplicates rows", async () => {
    const user = userEvent.setup();
    const repository = seeded();
    renderLibrary(repository);

    await user.click(await screen.findByRole("button", { name: "Rename Old" }));
    const input = screen.getByLabelText("Name");
    expect(input).toHaveValue("Old");
    await user.clear(input);
    await user.type(input, "Renamed{Enter}");
    expect(await screen.findByRole("link", { name: "Renamed" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Duplicate New" }));
    expect(await screen.findByRole("link", { name: "New (copy)" })).toBeInTheDocument();
    expect(await screen.findByText("Duplicated as 'New (copy)'.")).toBeInTheDocument();
  });

  it("requires confirmation before deleting, with Cancel focused", async () => {
    const user = userEvent.setup();
    const repository = seeded();
    renderLibrary(repository);

    await user.click(await screen.findByRole("button", { name: "Delete Old" }));
    const dialog = screen.getByRole("dialog", { name: "Delete 'Old'?" });
    expect(within(dialog).getByText(/This cannot be undone/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(await repository.exists("arch_old")).toBe(true);

    await user.click(screen.getByRole("button", { name: "Delete Old" }));
    await user.click(within(screen.getByRole("dialog", { name: "Delete 'Old'?" })).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("link", { name: "Old" })).not.toBeInTheDocument());
    expect(await repository.exists("arch_old")).toBe(false);
  });

  it("exports rows; damaged rows can only export raw JSON or be deleted", async () => {
    const user = userEvent.setup();
    const repository = seeded();
    const raw = { schemaVersion: 9 };
    repository.seed({
      status: "damaged",
      id: "arch_bad",
      name: "Broken",
      raw,
      issues: [{ code: "E_SCHEMA_VERSION_UNSUPPORTED", path: "", message: "The file uses format version 9." }],
    });
    const { services } = renderLibrary(repository);

    await user.click(await screen.findByRole("button", { name: "Export JSON of New" }));
    expect(services.exportArchitectureJson).toHaveBeenCalledWith(expect.objectContaining({ id: "arch_new" }));

    await user.click(screen.getByRole("button", { name: "Export Markdown of Old" }));
    expect(services.exportArchitectureMarkdown).toHaveBeenCalledTimes(1);
    expect(services.exportArchitectureMarkdown).toHaveBeenCalledWith(
      expect.objectContaining({ id: "arch_old", name: "Old" }),
    );

    const damagedRow = screen.getByText("Broken").closest("tr")!;
    expect(within(damagedRow).getByText("Can't be opened")).toBeInTheDocument();
    expect(within(damagedRow).getByText("The file uses format version 9.")).toBeInTheDocument();
    expect(within(damagedRow).queryByRole("link")).not.toBeInTheDocument();
    expect(within(damagedRow).queryByRole("button", { name: /Rename/ })).not.toBeInTheDocument();
    expect(within(damagedRow).queryByRole("button", { name: /Markdown/ })).not.toBeInTheDocument();
    await user.click(within(damagedRow).getByRole("button", { name: "Export raw JSON of Broken" }));
    expect(services.exportRawJson).toHaveBeenCalledWith(raw, "Broken");
  });

  it("shows the import error dialog and writes nothing for an invalid file", async () => {
    const user = userEvent.setup();
    const repository = createMemoryRepository();
    const { onOpen } = renderLibrary(repository);
    await screen.findByRole("heading", { name: "No architectures yet." });

    const input = document.querySelector<HTMLInputElement>("input[type='file']")!;
    await user.upload(input, jsonFile("{ not json"));

    const dialog = await screen.findByRole("dialog", { name: "This file can't be imported" });
    expect(within(dialog).getByText(/The file is not valid JSON/)).toBeInTheDocument();
    expect(within(dialog).getByText("Nothing was saved.")).toBeInTheDocument();
    expect(await repository.list()).toHaveLength(0);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("imports a valid file, reports an ID collision and opens the copy", async () => {
    const user = userEvent.setup();
    const repository = seeded();
    const { onOpen } = renderLibrary(repository);
    await screen.findAllByRole("link");

    const input = document.querySelector<HTMLInputElement>("input[type='file']")!;
    await user.upload(input, jsonFile(makeFile({ id: "arch_old", name: "Old" })));

    expect(
      await screen.findByText("Imported as 'Old (imported)' because an architecture with the same ID already exists."),
    ).toBeInTheDocument();
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0]?.[0]).not.toBe("arch_old");
  });

  it("shows a dismissible backup notice and an always-visible footer line", async () => {
    const user = userEvent.setup();
    renderLibrary(createMemoryRepository());
    expect(screen.getAllByText(BACKUP_NOTICE)).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.getAllByText(BACKUP_NOTICE)).toHaveLength(1);
    expect(window.localStorage.getItem("sa:ui:backup-notice-dismissed")).toBe("1");
  });
});
