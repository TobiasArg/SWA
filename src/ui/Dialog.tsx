import { useEffect, useId, useRef, type ReactNode } from "react";
import type { DialogHTMLAttributes } from "react";

export interface DialogProps
  extends Omit<DialogHTMLAttributes<HTMLDialogElement>, "open" | "onClose" | "title"> {
  open: boolean;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
}

export function Dialog({
  open,
  title,
  description,
  actions,
  onClose,
  children,
  className,
  ...dialogProps
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
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
      onClose={onClose}
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
