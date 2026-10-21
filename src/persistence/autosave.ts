import type { EditorStore } from "../editor/storeTypes";
import { toArchitectureFile } from "../domain/serialize";
import type { Repository, SaveController, SaveStatus } from "./types";

const DEBOUNCE_MS = 400;
const MAX_WAIT_MS = 2_000;

export function startAutosave(store: EditorStore, repo: Repository): SaveController {
  const listeners = new Set<() => void>();
  let status: { status: SaveStatus; error?: string } = { status: "saved" };
  let savedRevision = store.getState().revision;
  let observedRevision = savedRevision;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let maxWaitTimer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<boolean> | undefined;
  let followUpRequested = false;
  let disposed = false;

  const publish = (next: { status: SaveStatus; error?: string }): void => {
    if (disposed) return;
    if (status.status === next.status && status.error === next.error) return;
    status = next;
    listeners.forEach((listener) => listener());
  };

  const clearTimers = (): void => {
    if (debounceTimer !== undefined) clearTimeout(debounceTimer);
    if (maxWaitTimer !== undefined) clearTimeout(maxWaitTimer);
    debounceTimer = undefined;
    maxWaitTimer = undefined;
  };

  const hasUnsavedChanges = (): boolean => store.getState().revision > savedRevision;

  const saveSnapshot = async (): Promise<boolean> => {
    const snapshot = store.getState();
    const revision = snapshot.revision;
    publish({ status: "saving" });
    try {
      await repo.put(toArchitectureFile(snapshot.architecture));
      savedRevision = Math.max(savedRevision, revision);
      if (disposed) return true;
      if (hasUnsavedChanges()) publish({ status: "pending" });
      else publish({ status: "saved" });
      return true;
    } catch (error) {
      if (!disposed) {
        publish({
          status: "error",
          error: error instanceof Error ? error.message : "The architecture could not be saved.",
        });
      }
      return false;
    }
  };

  const runSave = async (): Promise<boolean> => {
    clearTimers();
    if (disposed) return false;
    if (inFlight) {
      followUpRequested = true;
      return inFlight;
    }
    if (!hasUnsavedChanges()) return status.status !== "error";

    const attemptedRevision = store.getState().revision;
    const operation = saveSnapshot();
    inFlight = operation;
    const succeeded = await operation;
    if (inFlight === operation) inFlight = undefined;

    const newerChanges = store.getState().revision > attemptedRevision;
    if (!disposed && newerChanges) {
      if (succeeded) publish({ status: "pending" });
      if (followUpRequested) {
        followUpRequested = false;
        void runSave();
      } else if (debounceTimer === undefined && maxWaitTimer === undefined) {
        scheduleSave();
      }
    } else {
      followUpRequested = false;
    }
    return succeeded;
  };

  function scheduleSave(): void {
    if (disposed) return;
    if (debounceTimer !== undefined) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      void runSave();
    }, DEBOUNCE_MS);
    if (maxWaitTimer === undefined) {
      maxWaitTimer = setTimeout(() => {
        maxWaitTimer = undefined;
        void runSave();
      }, MAX_WAIT_MS);
    }
  }

  const onStoreChange = (): void => {
    const revision = store.getState().revision;
    if (disposed || revision === observedRevision) return;
    observedRevision = revision;
    publish({ status: "pending" });
    scheduleSave();
  };

  const unsubscribeStore = store.subscribe(onStoreChange);

  return {
    getStatus() {
      return { ...status };
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async flush() {
      if (disposed) return false;
      clearTimers();
      while (!disposed) {
        if (inFlight) {
          const finished = await inFlight;
          if (!finished) return false;
          continue;
        }
        if (!hasUnsavedChanges()) return status.status !== "error";
        if (!(await runSave())) return false;
      }
      return false;
    },

    retry() {
      if (disposed) return;
      clearTimers();
      publish({ status: "pending" });
      void runSave();
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimers();
      unsubscribeStore();
      listeners.clear();
    },
  };
}
