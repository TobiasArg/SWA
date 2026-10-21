import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";
import { ToastProvider, useToast } from "./Toast";

function ToastTrigger({ onUndo }: { onUndo: () => void }) {
  const { showToast } = useToast();

  return (
    <Button
      onClick={() =>
        showToast("Component deleted.", {
          action: { label: "Undo", onClick: onUndo },
          durationMs: 0,
        })
      }
    >
      Delete component
    </Button>
  );
}

describe("ToastProvider and useToast", () => {
  it("shows a toast, invokes its action and dismisses it", async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    render(
      <ToastProvider>
        <ToastTrigger onUndo={onUndo} />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Delete component" }));
    expect(screen.getByRole("status")).toHaveTextContent("Component deleted.");
    await user.click(screen.getByRole("button", { name: "Undo" }));

    expect(onUndo).toHaveBeenCalledOnce();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
