import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PICKER_FOOTER_HINT, RelationshipTypePicker, placePicker } from "./RelationshipTypePicker";

function renderPicker() {
  const onChoose = vi.fn();
  const onCancel = vi.fn();
  render(
    <div>
      <button type="button">outside</button>
      <RelationshipTypePicker anchor={{ x: 100, y: 100 }} onChoose={onChoose} onCancel={onCancel} />
    </div>,
  );
  const listbox = screen.getByRole("listbox", { name: "Relationship type" });
  return { listbox, onChoose, onCancel };
}

function activeLabel(listbox: HTMLElement): string | null | undefined {
  const id = listbox.getAttribute("aria-activedescendant");
  return id ? document.getElementById(id)?.querySelector(".sa-type-picker__name")?.textContent : null;
}

describe("RelationshipTypePicker", () => {
  it("shows the 10 options with reads-as hints, the undirected tag and the footer hint, and takes focus", () => {
    const { listbox } = renderPicker();
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(10);
    expect(options[0]).toHaveTextContent("Delegates To");
    expect(options[0]).toHaveTextContent("Source delegates to target");
    expect(options[3]).toHaveTextContent("Source reads from target");
    expect(options[5]).toHaveTextContent("Shares Context With↔ undirected");
    expect(screen.getAllByText("↔ undirected")).toHaveLength(1);
    expect(screen.getByText(PICKER_FOOTER_HINT)).toBeInTheDocument();
    expect(listbox).toHaveFocus();
    expect(options[0]).toHaveAttribute("aria-selected", "true");
  });

  it("moves with arrows, Home and End and chooses with Enter", () => {
    const { listbox, onChoose, onCancel } = renderPicker();
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    expect(activeLabel(listbox)).toBe("Uses");
    fireEvent.keyDown(listbox, { key: "ArrowUp" });
    expect(activeLabel(listbox)).toBe("Supervises");
    fireEvent.keyDown(listbox, { key: "End" });
    expect(activeLabel(listbox)).toBe("Generic");
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    expect(activeLabel(listbox)).toBe("Generic");
    fireEvent.keyDown(listbox, { key: "Home" });
    fireEvent.keyDown(listbox, { key: "ArrowUp" });
    expect(activeLabel(listbox)).toBe("Delegates To");
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    fireEvent.keyDown(listbox, { key: "Enter" });
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith("supervises");
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("chooses on click", () => {
    const { onChoose } = renderPicker();
    fireEvent.click(screen.getByText("Shares Context With"));
    expect(onChoose).toHaveBeenCalledWith("shares_context_with");
  });

  it("cancels on Escape without letting the key reach the editor shortcuts", () => {
    const shell = vi.fn();
    document.addEventListener("keydown", shell);
    const { listbox, onChoose, onCancel } = renderPicker();
    fireEvent.keyDown(listbox, { key: "Escape" });
    fireEvent.keyDown(listbox, { key: "Delete" });
    document.removeEventListener("keydown", shell);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onChoose).not.toHaveBeenCalled();
    expect(shell).not.toHaveBeenCalled();
  });

  it("cancels on a pointer press outside, not inside", () => {
    const { onCancel } = renderPicker();
    fireEvent.pointerDown(screen.getByText("Uses"));
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByRole("button", { name: "outside" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("placePicker", () => {
  const size = { width: 280, height: 300 };
  const container = { width: 1000, height: 700 };

  it("places the popover below-right of the anchor", () => {
    expect(placePicker({ x: 100, y: 100 }, size, container)).toEqual({ x: 112, y: 112 });
  });

  it("flips near the right and bottom edges and clamps inside the canvas", () => {
    expect(placePicker({ x: 900, y: 600 }, size, container)).toEqual({ x: 900 - 12 - 280, y: 600 - 12 - 300 });
    expect(placePicker({ x: 100, y: 200 }, size, { width: 1000, height: 320 })).toEqual({ x: 112, y: 8 });
    expect(placePicker({ x: 2, y: 2 }, size, { width: 200, height: 200 }).x).toBe(8);
  });
});
