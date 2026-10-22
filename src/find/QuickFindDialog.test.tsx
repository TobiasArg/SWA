import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { installDialogPolyfill } from "../app/testUtils";
import { buildFixtureArchitecture, emptyArchitecture, makeComponent } from "../canvas/testing/fixtures";
import { createFakeStore } from "../canvas/testing/fakeStore";
import type { Architecture } from "../domain/types";
import { EditorProvider } from "../editor/context";
import { QUICK_FIND_STATUS_DELAY_MS, QuickFindDialog } from "./QuickFindDialog";

beforeAll(installDialogPolyfill);
afterEach(() => vi.useRealTimers());

interface HarnessProps {
  onChoose: (id: string) => void;
  onClose: () => void;
  /** Unmounts the opener while the dialog is open. */
  dropOpener?: boolean;
}

function Harness({ onChoose, onClose, dropOpener = false }: HarnessProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && dropOpener ? null : (
        <button type="button" onClick={() => setOpen(true)}>
          Find
        </button>
      )}
      <QuickFindDialog
        open={open}
        onChoose={(id) => {
          onChoose(id);
          setOpen(false);
        }}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
      />
    </>
  );
}

async function openQuickFind(architecture: Architecture = buildFixtureArchitecture(), dropOpener = false) {
  const user = userEvent.setup();
  const onChoose = vi.fn();
  const onClose = vi.fn();
  const store = createFakeStore(architecture);
  render(
    <EditorProvider store={store}>
      <Harness onChoose={onChoose} onClose={onClose} dropOpener={dropOpener} />
    </EditorProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Find" }));
  const input = screen.getByRole("combobox", { name: "Component name" });
  const listbox = screen.getByRole("listbox", { name: "Components" });
  const options = () => within(listbox).queryAllByRole("option");
  const optionNames = () => options().map((option) => option.querySelector(".sa-quick-find__name")?.textContent);
  const optionTexts = () => options().map((option) => option.textContent);
  return { user, onChoose, onClose, store, input, listbox, optionNames, optionTexts };
}

function activeOption(input: HTMLElement) {
  const id = input.getAttribute("aria-activedescendant");
  return id ? document.getElementById(id) : null;
}

describe("QuickFindDialog (QF3)", () => {
  it("is a modal titled Find component with an APG combobox and an always-shown listbox", async () => {
    const { input, listbox } = await openQuickFind();
    expect(screen.getByRole("dialog", { name: "Find component" })).toBeInTheDocument();
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("type", "search");
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-controls", listbox.id);
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    const options = within(listbox).getAllByRole("option");
    expect(options[0]!.id).toMatch(/-opt-0$/);
    expect(input).toHaveAttribute("aria-activedescendant", options[0]!.id);
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[1]).toHaveAttribute("aria-selected", "false");
  });

  it("lists every component by name on open, with type and group so duplicates can be told apart", async () => {
    const { optionTexts } = await openQuickFind();
    expect(optionTexts()).toEqual([
      "CRMExternal System",
      "Discovery AgentAgent · in Research Team",
      "Lead OrchestratorOrchestrator",
      "Lead RouterDecision / Routing Rule",
      "Shared Lead StoreMemory / Data Store",
      "Validation AgentAgent · in Research Team",
      "Web SearchTool",
    ]);
  });

  it("ranks results with the S5 search and marks the matching text", async () => {
    const { user, input, listbox, optionNames } = await openQuickFind();
    await user.type(input, "lead");
    // Prefix matches first, then the word-prefix match.
    expect(optionNames()).toEqual([
      "Lead Orchestrator",
      "Lead Router",
      "Shared Lead Store",
    ]);
    const marks = within(listbox).getAllByText((_, element) => element?.tagName === "MARK");
    expect(marks.map((mark) => mark.textContent)).toEqual(["Lead", "Lead", "Lead"]);
    expect(activeOption(input)).toHaveTextContent("Lead Orchestrator");

    await user.clear(input);
    await user.type(input, "research");
    // A group-name match lists members.
    expect(optionNames()).toEqual(["Discovery Agent", "Validation Agent"]);
  });

  it("moves aria-activedescendant with wrapping arrows and 10-step paging", async () => {
    const components = Array.from({ length: 25 }, (_, index) =>
      makeComponent({ id: `cmp_${index}`, type: "tool", name: `Tool ${String(index).padStart(2, "0")}` }),
    );
    const { user, input } = await openQuickFind(emptyArchitecture({ components }));
    expect(activeOption(input)).toHaveTextContent("Tool 00");
    await user.keyboard("{ArrowUp}");
    expect(activeOption(input)).toHaveTextContent("Tool 24");
    await user.keyboard("{ArrowDown}");
    expect(activeOption(input)).toHaveTextContent("Tool 00");
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(activeOption(input)).toHaveTextContent("Tool 02");
    await user.keyboard("{PageDown}");
    expect(activeOption(input)).toHaveTextContent("Tool 12");
    await user.keyboard("{PageDown}{PageDown}");
    expect(activeOption(input)).toHaveTextContent("Tool 24");
    await user.keyboard("{PageUp}");
    expect(activeOption(input)).toHaveTextContent("Tool 14");
    expect(activeOption(input)).toHaveAttribute("aria-selected", "true");
    // Typing resets to the first result (word prefix "10" ranks above substring "01").
    await user.type(input, "1");
    expect(activeOption(input)).toHaveTextContent("Tool 10");
  });

  it("does not move the active option on hover", async () => {
    const { user, input, listbox } = await openQuickFind();
    const before = input.getAttribute("aria-activedescendant");
    await user.hover(within(listbox).getAllByRole("option")[3]!);
    expect(input).toHaveAttribute("aria-activedescendant", before);
  });

  it("chooses the active option with Enter", async () => {
    const { user, input, onChoose, onClose, store } = await openQuickFind();
    await user.type(input, "valid");
    await user.keyboard("{Enter}");
    expect(onChoose).toHaveBeenCalledExactlyOnceWith("cmp_validation");
    expect(onClose).not.toHaveBeenCalled();
    // Selection is the caller's job.
    expect(store.selections).toHaveLength(0);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("chooses a clicked option", async () => {
    const { user, listbox, onChoose, onClose } = await openQuickFind();
    await user.click(within(listbox).getByRole("option", { name: /^Web Search/ }));
    expect(onChoose).toHaveBeenCalledExactlyOnceWith("cmp_search");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes with Escape without choosing and returns focus to the opener", async () => {
    const { user, input, onChoose, onClose } = await openQuickFind();
    await user.type(input, "crm");
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onChoose).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Find" })).toHaveFocus();
  });

  it("closes with the Close button", async () => {
    const { user, onClose } = await openQuickFind();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("falls back to the canvas when the opener is gone", async () => {
    const canvas = document.createElement("main");
    canvas.setAttribute("data-sa-canvas", "");
    canvas.tabIndex = -1;
    document.body.appendChild(canvas);
    try {
      const { user } = await openQuickFind(buildFixtureArchitecture(), true);
      expect(screen.queryByRole("button", { name: "Find" })).toBeNull();
      await user.keyboard("{Escape}");
      expect(canvas).toHaveFocus();
    } finally {
      canvas.remove();
    }
  });

  it("shows a debounced polite count status", async () => {
    const { input, onChoose } = await openQuickFind();
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("7 results");
    expect(input).toHaveAccessibleDescription("7 results");

    vi.useFakeTimers();
    fireEvent.change(input, { target: { value: "crm" } });
    expect(status).toHaveTextContent("7 results");
    act(() => vi.advanceTimersByTime(QUICK_FIND_STATUS_DELAY_MS - 1));
    expect(status).toHaveTextContent("7 results");
    act(() => vi.advanceTimersByTime(1));
    expect(status).toHaveTextContent("1 result");

    fireEvent.change(input, { target: { value: "zzz" } });
    act(() => vi.advanceTimersByTime(QUICK_FIND_STATUS_DELAY_MS));
    expect(status).toHaveTextContent('No components match "zzz"');
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).not.toHaveAttribute("aria-activedescendant");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("caps the list at 50 and says how to narrow it", async () => {
    const components = Array.from({ length: 60 }, (_, index) =>
      makeComponent({ id: `cmp_${index}`, type: "agent", name: `Agent ${index}` }),
    );
    const { listbox } = await openQuickFind(emptyArchitecture({ components }));
    expect(within(listbox).getAllByRole("option")).toHaveLength(50);
    expect(screen.getByRole("status")).toHaveTextContent("Showing 50 of 60. Keep typing to narrow the list.");
  });

  it("says when there are no components yet", async () => {
    const { input, onChoose, user } = await openQuickFind(emptyArchitecture());
    expect(screen.getByRole("status")).toHaveTextContent("No components yet");
    expect(input).toHaveAttribute("aria-expanded", "false");
    await user.keyboard("{Enter}");
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("resets the query each time it opens", async () => {
    const { user, input, optionNames } = await openQuickFind();
    await user.type(input, "crm");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Find" }));
    expect(screen.getByRole("combobox", { name: "Component name" })).toHaveValue("");
    expect(optionNames()).toHaveLength(7);
  });
});
