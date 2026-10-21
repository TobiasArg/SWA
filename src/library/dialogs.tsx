import { useId, useState, type FormEvent } from "react";
import type { ValidationIssue } from "../domain/validation/issues";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/icons";

export interface NameDialogProps {
  open: boolean;
  title: string;
  confirmLabel: string;
  initialName: string;
  busy?: boolean;
  onCancel(): void;
  onSubmit(name: string): void;
}

/** New architecture / Rename dialog (TD 11.2): one required Name field. */
export function NameDialog({ open, title, confirmLabel, initialName, busy = false, onCancel, onSubmit }: NameDialogProps) {
  const formId = useId();

  return (
    <Dialog
      open={open}
      title={title}
      onClose={onCancel}
      actions={
        <>
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={formId} disabled={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {/* Mounted per opening so the field starts from `initialName` each time. */}
      {open ? <NameForm formId={formId} initialName={initialName} onSubmit={onSubmit} /> : null}
    </Dialog>
  );
}

function NameForm({
  formId,
  initialName,
  onSubmit,
}: {
  formId: string;
  initialName: string;
  onSubmit(name: string): void;
}) {
  const inputId = useId();
  const errorId = useId();
  const [name, setName] = useState(initialName);
  const [showError, setShowError] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setShowError(true);
      return;
    }
    onSubmit(trimmed);
  };

  return (
    <form id={formId} className="sa-library-form" onSubmit={submit} noValidate>
      <label className="sa-library-form__label" htmlFor={inputId}>
        Name
      </label>
      <input
        id={inputId}
        className="sa-library-form__input"
        value={name}
        required
        autoFocus
        maxLength={50000}
        aria-invalid={showError || undefined}
        aria-describedby={showError ? errorId : undefined}
        onChange={(event) => {
          setName(event.target.value);
          if (event.target.value.trim()) setShowError(false);
        }}
      />
      {showError ? (
        <p className="sa-library-form__error" id={errorId}>
          <Icon name="alert" />
          Name is required
        </p>
      ) : null}
    </form>
  );
}

const MAX_LISTED_ISSUES = 20;

export interface ImportErrorDialogProps {
  issues: ValidationIssue[] | null;
  onClose(): void;
}

/** Import error dialog (TD 9.2, handoff 7.4): at most 20 issues, then "…and n more problems." */
export function ImportErrorDialog({ issues, onClose }: ImportErrorDialogProps) {
  const listed = issues?.slice(0, MAX_LISTED_ISSUES) ?? [];
  const remaining = (issues?.length ?? 0) - listed.length;

  return (
    <Dialog
      open={issues !== null}
      title="This file can't be imported"
      className="sa-import-error"
      onClose={onClose}
      actions={
        <Button variant="primary" onClick={onClose} autoFocus>
          Close
        </Button>
      }
    >
      <ul className="sa-import-error__issues">
        {listed.map((issue, index) => (
          <li key={`${issue.code}-${issue.path}-${index}`}>{issue.message}</li>
        ))}
      </ul>
      {remaining > 0 ? <p className="sa-import-error__more">…and {remaining} more problems.</p> : null}
      <p className="sa-import-error__nothing">Nothing was saved.</p>
    </Dialog>
  );
}
