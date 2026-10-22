import { toArchitectureFile } from "../domain/serialize";
import type { EditorStore } from "../editor/storeTypes";
import { diagramKey, type SnapshotCaptureResult, type SnapshotStore, type SnapshotTrigger } from "./snapshots";
import type { Repository, SaveController } from "./types";

const INTERVAL_MS = 10 * 60 * 1_000;
const FLUSH_REQUIRED_TRIGGERS: readonly SnapshotTrigger[] = ["leave", "manual", "pre-restore"];

interface CaptureObservation {
  contentRevision: number;
  diagramKey: string;
}

class SnapshotSchedulerDisposedError extends Error {
  constructor() {
    super("The snapshot scheduler has been disposed.");
    this.name = "SnapshotSchedulerDisposedError";
  }
}

class SnapshotFlushError extends Error {
  constructor() {
    super("The architecture could not be saved, so a version could not be captured.");
    this.name = "SnapshotFlushError";
  }
}

function isFlushRequired(trigger: SnapshotTrigger): boolean {
  return FLUSH_REQUIRED_TRIGGERS.includes(trigger);
}

export function startSnapshotScheduler(
  store: EditorStore,
  controller: SaveController,
  repository: Repository,
  snapshots: SnapshotStore,
  architectureId: string,
): { captureNow(trigger: SnapshotTrigger): Promise<SnapshotCaptureResult>; dispose(): void } {
  const sessionStartedAt = Date.now();
  const initialState = store.getState();
  const initialObservation: CaptureObservation = {
    contentRevision: initialState.contentRevision,
    diagramKey: diagramKey(toArchitectureFile(initialState.architecture)),
  };

  let disposed = false;
  let openBaselineInitialized = false;
  let lastSuccessfulCaptureAt: number | undefined;
  // The starting store state is the best available reference until the persisted
  // open record is read. The open read can lower this revision if memory was dirty.
  let lastCapturedContentRevision = initialObservation.contentRevision;
  let lastCapturedDiagramKey = initialObservation.diagramKey;
  let captureQueue: Promise<void> = Promise.resolve();

  const observe = (): CaptureObservation => {
    const state = store.getState();
    return {
      contentRevision: state.contentRevision,
      diagramKey: diagramKey(toArchitectureFile(state.architecture)),
    };
  };

  const logFailure = (trigger: SnapshotTrigger, error: unknown): void => {
    if (error instanceof SnapshotSchedulerDisposedError) return;
    console.error(`Snapshot ${trigger} capture failed for ${architectureId}.`, error);
  };

  const enqueue = <T>(trigger: SnapshotTrigger, operation: () => Promise<T>): Promise<T> => {
    const queued = captureQueue.then(async () => {
      if (disposed) throw new SnapshotSchedulerDisposedError();
      return operation();
    });
    captureQueue = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued.catch((error: unknown) => {
      logFailure(trigger, error);
      throw error;
    });
  };

  const capturePersisted = async (
    trigger: SnapshotTrigger,
    observation: CaptureObservation,
  ): Promise<SnapshotCaptureResult> => {
    const stored = await repository.get(architectureId);
    if (disposed) throw new SnapshotSchedulerDisposedError();
    if (stored === undefined) {
      throw new Error(`Architecture ${architectureId} was not found for snapshot capture.`);
    }
    if (stored.status === "damaged") {
      throw new Error(`Architecture ${architectureId} is damaged and cannot be captured as a version.`);
    }

    const persistedDiagramKey = diagramKey(stored.file);
    if (trigger === "open" && !openBaselineInitialized) {
      openBaselineInitialized = true;
      lastCapturedDiagramKey = persistedDiagramKey;
      if (persistedDiagramKey !== observation.diagramKey) {
        // The open snapshot represents the stored starting point, not dirty
        // in-memory content that happened to exist when the read began.
        lastCapturedContentRevision = Math.min(
          lastCapturedContentRevision,
          observation.contentRevision - 1,
        );
      } else {
        lastCapturedContentRevision = Math.max(
          lastCapturedContentRevision,
          observation.contentRevision,
        );
      }
    }

    const result = await snapshots.capture(stored.file, trigger);
    if (disposed) return result;
    if (result.status !== "skipped") {
      lastSuccessfulCaptureAt = Date.now();
      lastCapturedDiagramKey = persistedDiagramKey;
      if (persistedDiagramKey === observation.diagramKey) {
        lastCapturedContentRevision = Math.max(
          lastCapturedContentRevision,
          observation.contentRevision,
        );
      }
    }
    return result;
  };

  const intervalIsEligible = (observation: CaptureObservation, savedAt: number): boolean => {
    const previousCaptureAt = lastSuccessfulCaptureAt ?? sessionStartedAt;
    return (
      !disposed &&
      observation.contentRevision > lastCapturedContentRevision &&
      observation.diagramKey !== lastCapturedDiagramKey &&
      savedAt - previousCaptureAt >= INTERVAL_MS
    );
  };

  // Open is queued first. All other captures wait behind it so a slow startup
  // read cannot overwrite a newer timing or content baseline.
  void enqueue("open", () => capturePersisted("open", initialObservation)).catch(() => undefined);

  let observedSaveStatus = controller.getStatus().status;
  const unsubscribeController = controller.subscribe(() => {
    try {
      if (disposed) return;
      const nextStatus = controller.getStatus().status;
      const transitionedToSaved = observedSaveStatus !== "saved" && nextStatus === "saved";
      observedSaveStatus = nextStatus;
      if (!transitionedToSaved) return;

      const observation = observe();
      const savedAt = Date.now();
      if (!intervalIsEligible(observation, savedAt)) return;
      void enqueue("interval", async () => {
        // Recheck against successful captures queued ahead of this event. The
        // event timestamp is intentional: a stale save cannot become eligible
        // just because the serial queue took a long time to reach it.
        if (!intervalIsEligible(observation, savedAt)) return;
        await capturePersisted("interval", observation);
      }).catch(() => undefined);
    } catch (error) {
      logFailure("interval", error);
    }
  });

  return {
    async captureNow(trigger) {
      if (disposed) throw new SnapshotSchedulerDisposedError();

      let observation: CaptureObservation;
      try {
        if (isFlushRequired(trigger) && !(await controller.flush())) {
          throw new SnapshotFlushError();
        }
        if (disposed) throw new SnapshotSchedulerDisposedError();
        // Take this before any repository read or queue wait: later unsaved
        // edits must not be mistaken for the revision represented by a file.
        observation = observe();
      } catch (error) {
        logFailure(trigger, error);
        throw error;
      }

      return enqueue(trigger, () => capturePersisted(trigger, observation));
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribeController();
    },
  };
}
