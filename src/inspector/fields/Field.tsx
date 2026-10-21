import type { ReactNode } from "react";
import { Icon } from "../../ui/icons";

export interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  trailing?: ReactNode;
  /** False while the labelled control is swapped out, so the label never points at a missing element. */
  controlRendered?: boolean;
  children: ReactNode;
}

export function labelIdFor(id: string): string {
  return `${id}-label`;
}

export function describedBy(id: string, hint?: string, error?: string): string | undefined {
  const ids = [error ? `${id}-error` : "", hint ? `${id}-hint` : ""].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

/** Label above the control, then hint and error text below it (UI 8.2). */
export function Field({ id, label, hint, error, trailing, controlRendered = true, children }: FieldProps) {
  return (
    <div className="sa-field">
      <div className="sa-field__label-row">
        <label className="sa-field__label" id={labelIdFor(id)} htmlFor={controlRendered ? id : undefined}>
          {label}
        </label>
        {trailing}
      </div>
      {children}
      {error ? (
        <p className="sa-field__error" id={`${id}-error`}>
          <Icon name="alert" />
          {error}
        </p>
      ) : null}
      {hint ? (
        <p className="sa-field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
