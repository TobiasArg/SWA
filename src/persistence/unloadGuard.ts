import type { SaveController, SaveStatus } from "./types";

export type UnloadEventTarget = Pick<Window, "addEventListener" | "removeEventListener">;

export function installUnloadGuard(
  saveController: Pick<SaveController, "getStatus">,
  target: UnloadEventTarget = window,
): () => void {
  const onBeforeUnload = (event: Event): void => {
    const { status } = saveController.getStatus();
    if (!isUnsavedStatus(status)) return;
    event.preventDefault();
    (event as BeforeUnloadEvent).returnValue = "";
  };
  target.addEventListener("beforeunload", onBeforeUnload);
  return () => target.removeEventListener("beforeunload", onBeforeUnload);
}

function isUnsavedStatus(status: SaveStatus): boolean {
  return status === "pending" || status === "saving" || status === "error";
}
