import { useCallback, useSyncExternalStore } from "react";
import type { SaveController } from "../persistence/types";
import { Button } from "../ui/Button";
import { Icon } from "../ui/icons";

/** Toolbar save pill (TD 8.4, handoff 7.1): icon plus word, never a colored dot alone. */
export interface SaveStatusIndicatorProps {
  controller: SaveController;
}

export function useSaveStatus(controller: SaveController) {
  const subscribe = useCallback((listener: () => void) => controller.subscribe(listener), [controller]);
  const status = useSyncExternalStore(subscribe, () => controller.getStatus().status);
  const error = useSyncExternalStore(subscribe, () => controller.getStatus().error);
  return { status, error };
}

export function SaveStatusIndicator({ controller }: SaveStatusIndicatorProps) {
  const { status, error } = useSaveStatus(controller);

  if (status === "error") {
    return (
      <div className="sa-save-status sa-save-status--error">
        <span role="status" className="sa-save-status__text" title={error}>
          <Icon name="alert" />
          Save failed
        </span>
        <Button size="compact" onClick={() => controller.retry()}>
          Retry
        </Button>
      </div>
    );
  }

  const saved = status === "saved";
  return (
    <div className="sa-save-status">
      <span role="status" className="sa-save-status__text">
        {saved ? (
          <Icon name="check" className="sa-save-status__check" />
        ) : (
          <svg className="sa-save-status__dots" width="16" height="16" viewBox="0 0 24 24" aria-hidden focusable="false">
            <circle cx="6" cy="12" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="18" cy="12" r="1.6" />
          </svg>
        )}
        {saved ? "Saved" : "Saving…"}
      </span>
    </div>
  );
}
