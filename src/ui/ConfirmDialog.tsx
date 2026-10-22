import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { Icon } from "./icons";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** The consequence text, exposed as the dialog's accessible description. */
  description?: ReactNode;
  children?: ReactNode;
  confirmLabel?: string;
  busyLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  /** Inline failure message; the dialog stays open while it is shown. */
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * The app-styled replacement for `window.confirm` (UI_COLOR_CONFIRMATION_DESIGN §2.4): Cancel
 * gets the initial focus, Escape cancels, a backdrop click does nothing, and while busy the
 * dialog cannot be dismissed or confirmed twice. Restoring focus on close is the caller's job.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel = "Delete",
  busyLabel = "Deleting…",
  cancelLabel = "Cancel",
  busy = false,
  error = null,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Runs after Dialog's own effect has called `showModal()`.
  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  return (
    <Dialog
      open={open}
      title={title}
      description={description}
      dismissible={!busy}
      aria-busy={busy || undefined}
      // Escape cancels through the synchronous `cancel` event; the native `close` event is queued
      // as a task, so keys pressed in between would otherwise see a half-closed dialog.
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      onClose={() => {
        // Closing through `open` already went through a handler; only an unexpected native close cancels.
        if (open && !busy) onCancel();
      }}
      actions={
        <>
          {error ? (
            <p className="sa-dialog__error" role="alert">
              <Icon name="alert" />
              <span>{error}</span>
            </p>
          ) : null}
          <Button ref={cancelRef} onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (!busy) onConfirm();
            }}
            disabled={busy}
          >
            {busy ? busyLabel : confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
