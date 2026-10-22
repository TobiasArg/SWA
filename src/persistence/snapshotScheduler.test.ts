import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditorStore } from "../editor/store";
import type { EditorState, EditorStore } from "../editor/storeTypes";
import { toArchitectureFile } from "../domain/serialize";
import type { Architecture, ArchitectureFile } from "../domain/types";
import { validArchitectureFixture } from "../domain/validation/__fixtures__/fixtureFactory";
import { startAutosave } from "./autosave";
import { openRepository } from "./repository";
import { openSnapshotStore } from "./snapshots";
import type { SnapshotCaptureResult, SnapshotStore, SnapshotTrigger } from "./snapshots";
import { startSnapshotScheduler } from "./snapshotScheduler";
import type { Repository, SaveController, SaveStatus, StoredRecord } from "./types";

const disposers: Array<() => void> = [];

function defer<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function settleMicrotasks(): Promise<void> {
  for (let index = 0; index < 30; index += 1) await Promise.resolve();
}

function changedDiagram(file: ArchitectureFile, name = "Edited component"): ArchitectureFile {
  const changed = structuredClone(file);
  changed.architecture.components[0]!.name = name;
  return changed;
}

function createStoreHarness(architecture: Architecture, contentRevision = 0) {
  let state: EditorState = {
    architecture: structuredClone(architecture),
    selection: { componentIds: [], relationshipIds: [], groupIds: [] },
    canUndo: false,
    canRedo: false,
    revision: 0,
    contentRevision,
  };
  const listeners = new Set<() => void>();
  const store = {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as EditorStore;

  return {
    store,
    update(nextArchitecture: Architecture, contentChanged = true) {
      state = {
        ...state,
        architecture: structuredClone(nextArchitecture),
        revision: state.revision + 1,
        contentRevision: state.contentRevision + (contentChanged ? 1 : 0),
      };
      listeners.forEach((listener) => listener());
    },
  };
}

function createControllerHarness() {
  let currentStatus: { status: SaveStatus; error?: string } = { status: "saved" };
  const listeners = new Set<() => void>();
  const flush = vi.fn(async () => true);
  const controller = {
    getStatus: () => ({ ...currentStatus }),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    flush,
    retry: vi.fn(),
    dispose: vi.fn(),
  } as unknown as SaveController;

  return {
    controller,
    flush,
    setStatus(next: { status: SaveStatus; error?: string }) {
      if (currentStatus.status === next.status && currentStatus.error === next.error) return;
      currentStatus = next;
      [...listeners].forEach((listener) => listener());
    },
    notify() {
      [...listeners].forEach((listener) => listener());
    },
    emitSavedTransition() {
      this.setStatus({ status: "pending" });
      this.setStatus({ status: "saved" });
    },
  };
}

function createRepositoryHarness(initialFile: ArchitectureFile) {
  let persistedFile = structuredClone(initialFile);
  const get = vi.fn(async (id: string): Promise<StoredRecord | undefined> => {
    if (id !== persistedFile.architecture.id) return undefined;
    return { status: "ok", file: structuredClone(persistedFile) };
  });
  const put = vi.fn(async (file: ArchitectureFile) => {
    persistedFile = structuredClone(file);
  });
  const repository = { get, put } as unknown as Repository;
  return {
    repository,
    get,
    put,
    getPersisted: () => structuredClone(persistedFile),
    setPersisted(file: ArchitectureFile) {
      persistedFile = structuredClone(file);
    },
  };
}

function createSnapshotHarness(
  implementation: (file: ArchitectureFile, trigger: SnapshotTrigger) => Promise<SnapshotCaptureResult> =
    async (_file, trigger) => ({ status: "created", id: `snap_${trigger}` }),
) {
  const capture = vi.fn(implementation);
  const snapshots = {
    list: vi.fn(async () => []),
    get: vi.fn(async () => undefined),
    capture,
    close: vi.fn(),
  } as unknown as SnapshotStore;
  return { snapshots, capture };
}

function trackScheduler(
  store: EditorStore,
  controller: SaveController,
  repository: Repository,
  snapshots: SnapshotStore,
  architectureId: string,
) {
  const scheduler = startSnapshotScheduler(store, controller, repository, snapshots, architectureId);
  disposers.push(() => scheduler.dispose());
  return scheduler;
}

async function waitForCapture(capture: ReturnType<typeof vi.fn>, count: number): Promise<void> {
  for (let index = 0; index < 100 && capture.mock.calls.length < count; index += 1) {
    await Promise.resolve();
  }
  expect(capture).toHaveBeenCalledTimes(count);
  await settleMicrotasks();
}

afterEach(() => {
  for (const dispose of disposers.splice(0).reverse()) dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("snapshot scheduler", () => {
  it("captures the persisted open record rather than unsaved in-memory state", async () => {
    const persisted = validArchitectureFixture();
    const unsaved = changedDiagram(persisted, "Unsaved in memory");
    const store = createStoreHarness(unsaved.architecture, 1);
    const controller = createControllerHarness();
    const repository = createRepositoryHarness(persisted);
    const snapshots = createSnapshotHarness();

    trackScheduler(store.store, controller.controller, repository.repository, snapshots.snapshots, "arch_fixture");
    await waitForCapture(snapshots.capture, 1);

    expect(repository.get).toHaveBeenCalledWith("arch_fixture");
    expect(snapshots.capture).toHaveBeenCalledWith(persisted, "open");
  });

  it("samples revision before an open read and drops an interval event made stale by that open", async () => {
    vi.useFakeTimers({ now: 0 });
    const persisted = validArchitectureFixture();
    const edited = changedDiagram(persisted);
    const store = createStoreHarness(persisted.architecture);
    const controller = createControllerHarness();
    const repository = createRepositoryHarness(persisted);
    const openRead = defer<StoredRecord | undefined>();
    repository.get.mockImplementationOnce(() => openRead.promise);
    const openCapture = defer<SnapshotCaptureResult>();
    const snapshots = createSnapshotHarness(async (_file, trigger) => {
      if (trigger === "open") return openCapture.promise;
      return { status: "created", id: "snap_interval" };
    });

    trackScheduler(store.store, controller.controller, repository.repository, snapshots.snapshots, "arch_fixture");
    await settleMicrotasks();
    expect(repository.get).toHaveBeenCalledTimes(1);

    store.update(edited.architecture);
    repository.setPersisted(edited);
    await vi.advanceTimersByTimeAsync(10 * 60 * 1_000);
    controller.emitSavedTransition();
    await settleMicrotasks();
    expect(snapshots.capture).not.toHaveBeenCalled();

    openRead.resolve({ status: "ok", file: persisted });
    await waitForCapture(snapshots.capture, 1);
    expect(snapshots.capture.mock.calls[0]?.[1]).toBe("open");

    await vi.advanceTimersByTimeAsync(1);
    openCapture.resolve({ status: "created", id: "snap_open" });
    await settleMicrotasks();
    expect(snapshots.capture).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10 * 60 * 1_000);
    controller.emitSavedTransition();
    await settleMicrotasks();
    expect(snapshots.capture.mock.calls.map(([, trigger]) => trigger)).toEqual(["open", "interval"]);
    expect(snapshots.capture.mock.calls[1]?.[0]).toEqual(edited);
  });

  it("waits for the autosave debounce, respects the first boundary, and resets the ten-minute window", async () => {
    vi.useFakeTimers({ now: 0 });
    const file = validArchitectureFixture();
    const store = createEditorStore(file.architecture);
    const repository = createRepositoryHarness(file);
    const controller = startAutosave(store, repository.repository);
    disposers.push(() => controller.dispose());
    const snapshots = createSnapshotHarness();
    trackScheduler(store, controller, repository.repository, snapshots.snapshots, "arch_fixture");
    await waitForCapture(snapshots.capture, 1);

    await vi.advanceTimersByTimeAsync(5 * 60 * 1_000);
    store.dispatch({ kind: "updateComponent", id: "cmp_agent", patch: { name: "Saved before boundary" } });
    await vi.advanceTimersByTimeAsync(400);
    expect(repository.put).toHaveBeenCalledTimes(1);
    expect(controller.getStatus().status).toBe("saved");
    expect(snapshots.capture).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5 * 60 * 1_000 - 800);
    store.dispatch({ kind: "updateComponent", id: "cmp_agent", patch: { name: "Edited at boundary" } });
    await vi.advanceTimersByTimeAsync(399);
    expect(repository.put).toHaveBeenCalledTimes(1);
    expect(snapshots.capture).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await settleMicrotasks();
    expect(repository.put).toHaveBeenCalledTimes(2);
    expect(controller.getStatus().status).toBe("saved");
    expect(snapshots.capture.mock.calls.map(([, trigger]) => trigger)).toEqual(["open", "interval"]);
    expect(snapshots.capture.mock.calls[1]?.[0].architecture.components[0]?.name).toBe("Edited at boundary");

    await vi.advanceTimersByTimeAsync(5 * 60 * 1_000 - 400);
    store.dispatch({ kind: "updateComponent", id: "cmp_agent", patch: { name: "Before next boundary" } });
    await vi.advanceTimersByTimeAsync(400);
    await settleMicrotasks();
    expect(repository.put).toHaveBeenCalledTimes(3);
    expect(controller.getStatus().status).toBe("saved");
    expect(snapshots.capture.mock.calls.map(([, trigger]) => trigger)).toEqual(["open", "interval"]);
  });

  it("excludes viewport and metadata-only saves while capturing changed diagrams", async () => {
    vi.useFakeTimers({ now: 0 });
    const original = validArchitectureFixture();
    const store = createStoreHarness(original.architecture);
    const controller = createControllerHarness();
    const repository = createRepositoryHarness(original);
    const snapshots = createSnapshotHarness();
    trackScheduler(store.store, controller.controller, repository.repository, snapshots.snapshots, "arch_fixture");
    await waitForCapture(snapshots.capture, 1);
    await vi.advanceTimersByTimeAsync(10 * 60 * 1_000);

    const renamed: Architecture = { ...original.architecture, name: "Renamed architecture" };
    store.update(renamed);
    repository.setPersisted(toArchitectureFile(renamed));
    controller.emitSavedTransition();
    await settleMicrotasks();
    expect(snapshots.capture).toHaveBeenCalledTimes(1);

    const panned: Architecture = {
      ...renamed,
      canvas: { viewport: { x: 12, y: -4, zoom: 1.25 } },
    };
    store.update(panned, false);
    repository.setPersisted(toArchitectureFile(panned));
    controller.emitSavedTransition();
    await settleMicrotasks();
    expect(snapshots.capture).toHaveBeenCalledTimes(1);

    const edited = changedDiagram(toArchitectureFile(panned), "Diagram changed");
    store.update(edited.architecture);
    repository.setPersisted(edited);
    controller.notify();
    await settleMicrotasks();
    expect(snapshots.capture).toHaveBeenCalledTimes(1);
    controller.emitSavedTransition();
    await settleMicrotasks();
    expect(snapshots.capture.mock.calls.map(([, trigger]) => trigger)).toEqual(["open", "interval"]);

    const metadataAfterCapture: Architecture = { ...edited.architecture, name: "Name only again" };
    store.update(metadataAfterCapture);
    repository.setPersisted(toArchitectureFile(metadataAfterCapture));
    controller.emitSavedTransition();
    await settleMicrotasks();
    expect(snapshots.capture).toHaveBeenCalledTimes(2);
  });

  it("flushes leave before reading and propagates manual and pre-restore failures", async () => {
    const file = validArchitectureFixture();
    const store = createStoreHarness(file.architecture);
    const controller = createControllerHarness();
    const repository = createRepositoryHarness(file);
    const snapshots = createSnapshotHarness();
    const scheduler = trackScheduler(
      store.store,
      controller.controller,
      repository.repository,
      snapshots.snapshots,
      "arch_fixture",
    );
    await waitForCapture(snapshots.capture, 1);

    const events: string[] = [];
    const savedFile = changedDiagram(file, "Flushed state");
    store.update(savedFile.architecture);
    repository.get.mockImplementation(async () => {
      events.push("get");
      return { status: "ok", file: repository.getPersisted() };
    });
    snapshots.capture.mockImplementation(async (_file, trigger) => {
      events.push(`capture:${trigger}`);
      if (trigger === "manual" || trigger === "pre-restore") throw new Error(`${trigger} failed`);
      return { status: "created", id: `snap_${trigger}` };
    });

    const leaveFlush = defer<boolean>();
    controller.flush.mockImplementationOnce(() => {
      events.push("flush");
      return leaveFlush.promise;
    });
    const leaving = scheduler.captureNow("leave");
    await settleMicrotasks();
    expect(events).toEqual(["flush"]);
    repository.setPersisted(savedFile);
    leaveFlush.resolve(true);
    await expect(leaving).resolves.toEqual({ status: "created", id: "snap_leave" });
    expect(events).toEqual(["flush", "get", "capture:leave"]);
    expect(snapshots.capture.mock.calls.at(-1)?.[0]).toEqual(savedFile);

    events.length = 0;
    controller.flush.mockImplementation(async () => {
      events.push("flush");
      return true;
    });
    for (const trigger of ["manual", "pre-restore"] as const) {
      events.length = 0;
      await expect(scheduler.captureNow(trigger)).rejects.toThrow(`${trigger} failed`);
      expect(events).toEqual(["flush", "get", `capture:${trigger}`]);
    }
    expect(controller.flush).toHaveBeenCalledTimes(3);
  });

  it("rejects a capture when flush fails without reading storage", async () => {
    const file = validArchitectureFixture();
    const store = createStoreHarness(file.architecture);
    const controller = createControllerHarness();
    const repository = createRepositoryHarness(file);
    const snapshots = createSnapshotHarness();
    const scheduler = trackScheduler(
      store.store,
      controller.controller,
      repository.repository,
      snapshots.snapshots,
      "arch_fixture",
    );
    await waitForCapture(snapshots.capture, 1);
    repository.get.mockClear();
    snapshots.capture.mockClear();

    controller.flush.mockResolvedValueOnce(false);
    await expect(scheduler.captureNow("manual")).rejects.toThrow("could not be saved");
    controller.flush.mockResolvedValueOnce(false);
    await expect(scheduler.captureNow("leave")).rejects.toThrow("could not be saved");
    expect(repository.get).not.toHaveBeenCalled();
    expect(snapshots.capture).not.toHaveBeenCalled();
    expect(controller.flush).toHaveBeenCalledTimes(2);
  });

  it("retries a failed interval on the next saved transition without advancing its baseline", async () => {
    vi.useFakeTimers({ now: 0 });
    const file = validArchitectureFixture();
    const store = createStoreHarness(file.architecture);
    const controller = createControllerHarness();
    const repository = createRepositoryHarness(file);
    const captureError = new Error("Snapshot storage failed");
    const snapshots = createSnapshotHarness(async (_file, trigger) => {
      if (trigger === "interval" && snapshots.capture.mock.calls.filter(([, item]) => item === "interval").length === 1) {
        throw captureError;
      }
      return { status: "created", id: `snap_${trigger}` };
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    trackScheduler(store.store, controller.controller, repository.repository, snapshots.snapshots, "arch_fixture");
    await waitForCapture(snapshots.capture, 1);
    await vi.advanceTimersByTimeAsync(10 * 60 * 1_000);

    const edited = changedDiagram(file);
    store.update(edited.architecture);
    repository.setPersisted(edited);
    controller.emitSavedTransition();
    await settleMicrotasks();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Snapshot interval capture failed"), captureError);

    controller.emitSavedTransition();
    await settleMicrotasks();
    expect(snapshots.capture.mock.calls.map(([, trigger]) => trigger)).toEqual(["open", "interval", "interval"]);
  });

  it("does not let rejected open or interval background captures affect real autosave", async () => {
    vi.useFakeTimers({ now: 0 });
    const file = validArchitectureFixture();
    const store = createEditorStore(file.architecture);
    const repository = createRepositoryHarness(file);
    const controller = startAutosave(store, repository.repository);
    disposers.push(() => controller.dispose());
    const captureFailure = new Error("Snapshots unavailable");
    const snapshots = createSnapshotHarness(async () => {
      throw captureFailure;
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    trackScheduler(store, controller, repository.repository, snapshots.snapshots, "arch_fixture");
    await waitForCapture(snapshots.capture, 1);
    await settleMicrotasks();
    expect(controller.getStatus().status).toBe("saved");

    await vi.advanceTimersByTimeAsync(10 * 60 * 1_000);
    store.dispatch({ kind: "updateComponent", id: "cmp_agent", patch: { name: "Save still works" } });
    await vi.advanceTimersByTimeAsync(400);
    await settleMicrotasks();

    expect(snapshots.capture.mock.calls.map(([, trigger]) => trigger)).toEqual(["open", "interval"]);
    expect(log).toHaveBeenCalledTimes(2);
    expect(controller.getStatus()).toEqual({ status: "saved" });
    expect(repository.put).toHaveBeenCalledTimes(1);
  });

  it("does not capture missing or damaged repository records and rejects/logs explicit requests", async () => {
    const file = validArchitectureFixture();
    const cases: Array<[StoredRecord | undefined, string]> = [
      [undefined, "was not found"],
      [{ status: "damaged", id: "arch_fixture", name: "Broken", issues: [], raw: {} }, "is damaged"],
    ];

    for (const [record, message] of cases) {
      const store = createStoreHarness(file.architecture);
      const controller = createControllerHarness();
      const get = vi.fn(async () => record);
      const repository = { get } as unknown as Repository;
      const snapshots = createSnapshotHarness();
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const scheduler = trackScheduler(
        store.store,
        controller.controller,
        repository,
        snapshots.snapshots,
        "arch_fixture",
      );
      await settleMicrotasks();
      await expect(scheduler.captureNow("manual")).rejects.toThrow(message);
      expect(snapshots.capture).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(expect.stringContaining("Snapshot open capture failed"), expect.any(Error));
      expect(log).toHaveBeenCalledWith(expect.stringContaining("Snapshot manual capture failed"), expect.any(Error));
      log.mockRestore();
    }
  });

  it("suppresses queued and post-dispose work while allowing an already-started capture to finish", async () => {
    const file = validArchitectureFixture();
    const store = createStoreHarness(file.architecture);
    const controller = createControllerHarness();
    const repository = createRepositoryHarness(file);
    const openRead = defer<StoredRecord | undefined>();
    repository.get.mockImplementationOnce(() => openRead.promise);
    const snapshots = createSnapshotHarness();
    const scheduler = trackScheduler(
      store.store,
      controller.controller,
      repository.repository,
      snapshots.snapshots,
      "arch_fixture",
    );
    await settleMicrotasks();
    const manual = scheduler.captureNow("manual");
    await settleMicrotasks();
    scheduler.dispose();
    controller.emitSavedTransition();
    openRead.resolve({ status: "ok", file });
    await expect(manual).rejects.toThrow("disposed");
    await settleMicrotasks();
    expect(repository.get).toHaveBeenCalledTimes(1);
    expect(snapshots.capture).not.toHaveBeenCalled();

    const secondStore = createStoreHarness(file.architecture);
    const secondController = createControllerHarness();
    const secondRepository = createRepositoryHarness(file);
    const inFlightCapture = defer<SnapshotCaptureResult>();
    const secondSnapshots = createSnapshotHarness(async () => inFlightCapture.promise);
    const secondScheduler = trackScheduler(
      secondStore.store,
      secondController.controller,
      secondRepository.repository,
      secondSnapshots.snapshots,
      "arch_fixture",
    );
    await waitForCapture(secondSnapshots.capture, 1);
    secondScheduler.dispose();
    inFlightCapture.resolve({ status: "created", id: "snap_open" });
    await settleMicrotasks();
    secondController.emitSavedTransition();
    expect(secondSnapshots.capture).toHaveBeenCalledTimes(1);
  });

  it("uses real SnapshotStore low-storage policy: automatic open skips but manual capture proceeds", async () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const databaseName = `snapshot-scheduler-low-storage-${crypto.randomUUID()}`;
    const file = validArchitectureFixture();
    const repository = await openRepository(databaseName);
    const snapshots = await openSnapshotStore(databaseName, {
      estimateStorage: async () => ({ usage: 81, quota: 100 }),
    });
    disposers.push(() => repository.close());
    disposers.push(() => snapshots.close());
    await repository.put(file);

    const captureResults: Array<{ trigger: SnapshotTrigger; result: SnapshotCaptureResult }> = [];
    const openCaptureDone = defer<void>();
    const observedSnapshots: SnapshotStore = {
      list: (architectureId) => snapshots.list(architectureId),
      get: (id) => snapshots.get(id),
      capture: async (captureFile, trigger) => {
        const result = await snapshots.capture(captureFile, trigger);
        captureResults.push({ trigger, result });
        if (trigger === "open") openCaptureDone.resolve();
        return result;
      },
      close: () => snapshots.close(),
    };
    const store = createStoreHarness(file.architecture);
    const controller = createControllerHarness();
    const scheduler = trackScheduler(store.store, controller.controller, repository, observedSnapshots, "arch_fixture");
    await openCaptureDone.promise;
    await settleMicrotasks();

    expect(captureResults).toEqual([{ trigger: "open", result: { status: "skipped", reason: "low-storage" } }]);
    expect(await snapshots.list("arch_fixture")).toHaveLength(0);
    const manualCapture = await scheduler.captureNow("manual");
    expect(manualCapture.status).toBe("created");
    expect(await snapshots.list("arch_fixture")).toHaveLength(1);
    if (manualCapture.status !== "created") throw new Error("Expected a manual snapshot to be created.");

    now = 5 * 60 * 1_000;
    const unchangedManualCapture = await scheduler.captureNow("manual");
    expect(unchangedManualCapture).toEqual({ status: "unchanged", id: manualCapture.id });

    now = 10 * 60 * 1_000;
    const recoveryFile = changedDiagram(file, "Before restore");
    await repository.put(recoveryFile);
    store.update(recoveryFile.architecture);
    controller.emitSavedTransition();
    await settleMicrotasks();
    expect(captureResults.map(({ trigger }) => trigger)).toEqual(["open", "manual", "manual"]);

    const recoveryCapture = await scheduler.captureNow("pre-restore");
    expect(recoveryCapture.status).toBe("created");

    const versions = await snapshots.list("arch_fixture");
    expect(versions).toHaveLength(2);
    expect(versions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "ok", trigger: "manual", snapshotClass: "manual" }),
        expect.objectContaining({ status: "ok", trigger: "pre-restore", snapshotClass: "recovery" }),
      ]),
    );
  });
});
