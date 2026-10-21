import { afterEach, describe, expect, it, vi } from "vitest";
import type { EditorStore } from "../editor/storeTypes";
import type { Architecture } from "../domain/types";
import { validArchitectureFixture } from "../domain/validation/__fixtures__/fixtureFactory";
import type { Repository } from "./types";
import { startAutosave } from "./autosave";

function createStoreHarness() {
  let state = {
    architecture: validArchitectureFixture().architecture,
    selection: { componentIds: [], relationshipIds: [], groupIds: [] },
    canUndo: false,
    canRedo: false,
    revision: 0,
    contentRevision: 0,
  };
  const listeners = new Set<() => void>();
  const store = {
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as EditorStore;

  return {
    store,
    update(revision: number, architecture: Architecture = state.architecture) {
      state = { ...state, revision, contentRevision: revision, architecture };
      listeners.forEach((listener) => listener());
    },
  };
}

function testRepository(put: Repository["put"]): Repository {
  return { put } as unknown as Repository;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("autosave controller", () => {
  it("debounces saves and publishes pending/saving/saved transitions", async () => {
    vi.useFakeTimers();
    const harness = createStoreHarness();
    const put = vi.fn().mockResolvedValue(undefined);
    const controller = startAutosave(harness.store, testRepository(put));
    const transitions: string[] = [];
    controller.subscribe(() => transitions.push(controller.getStatus().status));

    harness.update(1);
    expect(controller.getStatus()).toEqual({ status: "pending" });
    await vi.advanceTimersByTimeAsync(399);
    expect(put).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(put).toHaveBeenCalledTimes(1);
    expect(controller.getStatus()).toEqual({ status: "saved" });
    expect(transitions).toEqual(["pending", "saving", "saved"]);
    controller.dispose();
  });

  it("honors the max-wait window while edits keep arriving", async () => {
    vi.useFakeTimers();
    const harness = createStoreHarness();
    const put = vi.fn().mockResolvedValue(undefined);
    const controller = startAutosave(harness.store, testRepository(put));

    harness.update(1);
    for (let revision = 2; revision <= 6; revision += 1) {
      await vi.advanceTimersByTimeAsync(300);
      harness.update(revision);
    }
    expect(put).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(put).toHaveBeenCalledTimes(1);
    expect(controller.getStatus().status).toBe("saved");
    controller.dispose();
  });

  it("flushes immediately and waits for a follow-up write with the latest state", async () => {
    vi.useFakeTimers();
    const harness = createStoreHarness();
    let finishFirst: (() => void) | undefined;
    const put = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (finishFirst = resolve)))
      .mockResolvedValueOnce(undefined);
    const controller = startAutosave(harness.store, testRepository(put));

    harness.update(1);
    const flushed = controller.flush();
    await Promise.resolve();
    expect(put).toHaveBeenCalledTimes(1);
    harness.update(2, {
      ...harness.store.getState().architecture,
      name: "Latest architecture state",
    });
    finishFirst?.();

    await expect(flushed).resolves.toBe(true);
    expect(put).toHaveBeenCalledTimes(2);
    expect(put.mock.calls[1]?.[0].architecture.name).toBe("Latest architecture state");
    expect(controller.getStatus()).toEqual({ status: "saved" });
    controller.dispose();
  });

  it("keeps errors visible, retries on the next change, and exposes manual retry", async () => {
    vi.useFakeTimers();
    const harness = createStoreHarness();
    const put = vi
      .fn()
      .mockRejectedValueOnce(new Error("Quota exceeded"))
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Storage closed"))
      .mockResolvedValueOnce(undefined);
    const controller = startAutosave(harness.store, testRepository(put));

    harness.update(1);
    await expect(controller.flush()).resolves.toBe(false);
    expect(controller.getStatus()).toEqual({ status: "error", error: "Quota exceeded" });

    harness.update(2);
    await vi.advanceTimersByTimeAsync(400);
    expect(controller.getStatus()).toEqual({ status: "saved" });

    harness.update(3);
    await expect(controller.flush()).resolves.toBe(false);
    expect(controller.getStatus()).toEqual({ status: "error", error: "Storage closed" });
    controller.retry();
    await vi.runAllTimersAsync();
    expect(controller.getStatus()).toEqual({ status: "saved" });
    expect(put).toHaveBeenCalledTimes(4);
    controller.dispose();
  });

  it("does not write when no architecture revision has changed", async () => {
    const harness = createStoreHarness();
    const put = vi.fn().mockResolvedValue(undefined);
    const controller = startAutosave(harness.store, testRepository(put));

    await expect(controller.flush()).resolves.toBe(true);
    expect(put).not.toHaveBeenCalled();
    controller.dispose();
  });
});
