import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { installDialogPolyfill } from "../app/testUtils";
import { ConfirmDialog, type ConfirmDialogProps } from "./ConfirmDialog";

beforeAll(installDialogPolyfill);

function Harness(props: Partial<ConfirmDialogProps>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <ConfirmDialog
        open={open}
        title="Delete 1 component?"
        description="You can undo this with Undo or ⌘Z / Ctrl+Z."
        {...props}
        onCancel={() => {
          props.onCancel?.();
          setOpen(false);
        }}
        onConfirm={() => {
          props.onConfirm?.();
          if (!props.busy) setOpen(false);
        }}
      />
    </>
  );
}

async function openHarness(props: Partial<ConfirmDialogProps> = {}) {
  const user = userEvent.setup();
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  render(<Harness onCancel={onCancel} onConfirm={onConfirm} {...props} />);
  await user.click(screen.getByRole("button", { name: "Open" }));
  return { user, onCancel, onConfirm, dialog: screen.getByRole("dialog", { name: "Delete 1 component?" }) };
}

describe("ConfirmDialog", () => {
  it("exposes the title and description and focuses Cancel before the specific confirm verb", async () => {
    const { dialog } = await openHarness({ confirmLabel: "Ungroup" });
    expect(dialog).toHaveAccessibleDescription("You can undo this with Undo or ⌘Z / Ctrl+Z.");
    const buttons = Array.from(dialog.querySelectorAll("button")).map((button) => button.textContent);
    expect(buttons).toEqual(["Cancel", "Ungroup"]);
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("cancels with the Cancel button, Enter on Cancel and Escape without confirming", async () => {
    const { user, onCancel, onConfirm } = await openHarness();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    expect(onCancel).toHaveBeenCalledTimes(3);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("confirms by click or by keyboard on the confirm button", async () => {
    const { user, onConfirm } = await openHarness();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.tab();
    expect(screen.getByRole("button", { name: "Delete" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.tab();
    await user.keyboard(" ");
    expect(onConfirm).toHaveBeenCalledTimes(3);
  });

  it("ignores a backdrop click", async () => {
    const { user, dialog, onCancel, onConfirm } = await openHarness();
    await user.click(dialog);
    expect(dialog).toHaveAttribute("open");
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("cannot be dismissed or confirmed again while busy", async () => {
    const { user, dialog, onCancel, onConfirm } = await openHarness({ busy: true });
    expect(dialog).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Deleting…" })).toBeDisabled();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(dialog).toHaveAttribute("open");
    await user.click(screen.getByRole("button", { name: "Deleting…" }));
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("shows a failure inline as an alert", async () => {
    const { dialog } = await openHarness({ error: "The architecture could not be deleted (disk full)." });
    expect(screen.getByRole("alert")).toHaveTextContent("The architecture could not be deleted (disk full).");
    expect(dialog).toContainElement(screen.getByRole("alert"));
  });
});
