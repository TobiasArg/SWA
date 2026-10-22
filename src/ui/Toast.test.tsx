import { useEffect } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./Button";
import { ToastProvider, useToast, type ToastController } from "./Toast";

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

describe("toast timing", () => {
  function TimedTrigger({ action }: { action: boolean }) {
    const { showToast } = useToast();
    return (
      <Button
        onClick={() =>
          showToast("Deleted 1 component.", action ? { action: { label: "Undo", onClick: () => undefined } } : {})
        }
      >
        Show
      </Button>
    );
  }

  function renderTimed(action: boolean) {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <TimedTrigger action={action} />
      </ToastProvider>,
    );
    const trigger = screen.getByRole("button", { name: "Show" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("status")).toHaveTextContent("Deleted 1 component.");
  }

  function advance(ms: number) {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps a plain toast for 5 s and a toast with an action for 10 s without moving focus", () => {
    renderTimed(false);
    advance(4999);
    expect(screen.queryByRole("status")).toBeInTheDocument();
    advance(1);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    cleanup();
    renderTimed(true);
    expect(screen.getByRole("button", { name: "Show" })).toHaveFocus();
    advance(9999);
    expect(screen.queryByRole("status")).toBeInTheDocument();
    advance(1);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("pauses while hovered and resumes with the remaining time", () => {
    renderTimed(true);
    advance(6000);
    fireEvent.pointerEnter(screen.getByRole("status"));
    advance(20_000);
    expect(screen.queryByRole("status")).toBeInTheDocument();

    fireEvent.pointerLeave(screen.getByRole("status"));
    advance(3999);
    expect(screen.queryByRole("status")).toBeInTheDocument();
    advance(1);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("pauses while focus is inside and resumes with the remaining time", () => {
    renderTimed(true);
    advance(7000);
    const undo = screen.getByRole("button", { name: "Undo" });
    act(() => undo.focus());
    advance(20_000);
    expect(screen.queryByRole("status")).toBeInTheDocument();

    fireEvent.pointerEnter(screen.getByRole("status"));
    fireEvent.pointerLeave(screen.getByRole("status"));
    advance(5000);
    expect(screen.queryByRole("status")).toBeInTheDocument();

    act(() => screen.getByRole("button", { name: "Show" }).focus());
    advance(2999);
    expect(screen.queryByRole("status")).toBeInTheDocument();
    advance(1);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("calls onClose once whether the toast times out, is dismissed or its action runs", () => {
    const onClose = vi.fn();
    let controller: ToastController | undefined;
    function Capture({ onReady }: { onReady: (value: ToastController) => void }) {
      const value = useToast();
      useEffect(() => {
        onReady(value);
      }, [onReady, value]);
      return null;
    }
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Capture
          onReady={(value) => {
            controller = value;
          }}
        />
      </ToastProvider>,
    );
    act(() => {
      controller!.showToast("Timed out.", { onClose });
    });
    advance(5000);
    expect(onClose).toHaveBeenCalledTimes(1);

    let id = -1;
    act(() => {
      id = controller!.showToast("Dismissed.", { onClose });
    });
    act(() => controller!.dismissToast(id));
    act(() => controller!.dismissToast(id));
    expect(onClose).toHaveBeenCalledTimes(2);

    act(() => {
      controller!.showToast("Acted.", { action: { label: "Undo", onClick: () => undefined }, onClose });
    });
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    advance(20_000);
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
