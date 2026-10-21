import { useId } from "react";
import { describedBy, Field } from "./Field";
import { useDraft } from "./useDraft";

export interface ListFieldProps {
  label: string;
  value: string[] | undefined;
  /** Receives trimmed, non-empty lines, or `undefined` when there are none. */
  onChange: (value: string[] | undefined) => void;
  onBlur?: () => void;
}

const HINT = "One item per line";

export function linesToList(draft: string): string[] | undefined {
  const items = draft
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  return items.length > 0 ? items : undefined;
}

function listDraft(value: string[] | undefined): string {
  return (value ?? []).join("\n");
}

function sameList(a: string[] | undefined, b: string[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
}

export function ListField({ label, value, onChange, onBlur }: ListFieldProps) {
  const id = useId();
  const [draft, setDraft] = useDraft(value, listDraft, linesToList, sameList);

  return (
    <Field id={id} label={label} hint={HINT}>
      <textarea
        id={id}
        className="sa-input"
        rows={4}
        value={draft}
        aria-describedby={describedBy(id, HINT)}
        onChange={(event) => {
          setDraft(event.target.value);
          const next = linesToList(event.target.value);
          if (!sameList(next, value)) onChange(next);
        }}
        onBlur={onBlur}
      />
    </Field>
  );
}
