import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import type { DialogHTMLAttributes } from "react";

export interface DialogProps
  extends Omit<DialogHTMLAttributes<HTMLDialogElement>, "open" | "onClose" | "title"> {
  open: boolean;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** When false, Escape cannot close the dialog (busy confirmations, UI_COLOR_CONFIRMATION_DESIGN CD6). */
  dismissible?: boolean;
  onClose: () => void;
}

export function Dialog({
  open,
  title,
  description,
  actions,
  dismissible = true,
  onClose,
  onCancel,
  children,
  className,
  ...dialogProps
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  // A layout effect, so a `flushSync` close takes the dialog out of the top layer immediately.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      {...dialogProps}
      ref={dialogRef}
      className={className ? `sa-dialog ${className}` : "sa-dialog"}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        onCancel?.(event);
        if (!dismissible) event.preventDefault();
      }}
      onClose={() => {
        const dialog = dialogRef.current;
        // `close` is dispatched as a task; if the dialog was reopened meanwhile, the event is stale.
        if (dialog?.open) return;
        // Browsers may skip a prevented `cancel` on repeated Escape; reopen instead of dismissing.
        if (!dismissible && open && dialog) {
          dialog.showModal();
          return;
        }
        onClose();
      }}
    >
      <header>
        <h2 className="sa-dialog__title" id={titleId}>
          {title}
        </h2>
        {description ? (
          <div className="sa-dialog__description" id={descriptionId}>
            {description}
          </div>
        ) : null}
      </header>
      {children ? <div className="sa-dialog__body">{children}</div> : null}
      {actions ? <div className="sa-dialog__actions">{actions}</div> : null}
    </dialog>
  );
}
