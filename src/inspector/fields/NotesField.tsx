import { lazy, Suspense, useState } from "react";
import { Icon } from "../../ui/icons";
import { TextAreaField, type PreviewLabelling } from "./TextField";

// Loaded on first preview so the Markdown renderer stays out of the initial bundle.
const MarkdownPreview = lazy(() => import("../../ui/MarkdownPreview"));

type NotesMode = "edit" | "preview";

const MODES: readonly { value: NotesMode; label: string }[] = [
  { value: "edit", label: "Edit" },
  { value: "preview", label: "Preview" },
];

export interface NotesFieldProps {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  onBlur?: () => void;
}

/** Markdown notes with an Edit / Preview toggle in the label row. Mode is local view state. */
export function NotesField({ value, onChange, onBlur }: NotesFieldProps) {
  const [mode, setMode] = useState<NotesMode>("edit");

  const toggle = (
    <div className="sa-mode-toggle" role="group" aria-label="Notes view">
      {MODES.map((option) => (
        <button
          key={option.value}
          type="button"
          className="sa-mode-toggle__option"
          aria-pressed={mode === option.value}
          onClick={() => setMode(option.value)}
        >
          {mode === option.value ? <Icon name="check" size={12} /> : null}
          {option.label}
        </button>
      ))}
    </div>
  );

  const preview =
    mode === "preview"
      ? (labelling: PreviewLabelling) => (
          <div className="sa-notes-preview" role="region" {...labelling}>
            <Suspense fallback={<p className="sa-field__hint">Loading preview…</p>}>
              <MarkdownPreview source={value} />
            </Suspense>
          </div>
        )
      : undefined;

  return (
    <TextAreaField
      label="Notes"
      hint="Markdown"
      monospace
      rows={4}
      trailing={toggle}
      preview={preview}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
    />
  );
}
