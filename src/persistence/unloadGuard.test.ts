import { describe, expect, it } from "vitest";
import type { SaveStatus } from "./types";
import { installUnloadGuard } from "./unloadGuard";

describe("before-unload guard", () => {
  it.each<SaveStatus>(["pending", "saving", "error"])("prevents leaving while save status is %s", (status) => {
    let currentStatus = status;
    const target = new EventTarget();
    const remove = installUnloadGuard(
      { getStatus: () => ({ status: currentStatus }) },
      target as unknown as Window,
    );
    const event = new Event("beforeunload", { cancelable: true });

    target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    remove();

    currentStatus = "saved";
    const savedEvent = new Event("beforeunload", { cancelable: true });
    target.dispatchEvent(savedEvent);
    expect(savedEvent.defaultPrevented).toBe(false);
  });

  it("does not prevent leaving after a successful save", () => {
    const target = new EventTarget();
    const remove = installUnloadGuard(
      { getStatus: () => ({ status: "saved" }) },
      target as unknown as Window,
    );
    const event = new Event("beforeunload", { cancelable: true });

    target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    remove();
  });
});
