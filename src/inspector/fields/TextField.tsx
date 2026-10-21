import { useId, type ReactNode } from "react";
import { describedBy, Field } from "./Field";
import { optionalText, textDraft, useDraft } from "./useDraft";

interface BaseProps {
  label: string;
  hint?: string;
  trailing?: ReactNode;
  multiline?: boolean;
  rows?: number;
  monospace?: boolean;
  onBlur?: () => void;
}

interface OptionalTextProps extends BaseProps {
  required?: false;
  value: string | undefined;
  /** Receives `undefined` when the field is cleared (TD 3.1 normalization). */
  onChange: (value: string | undefined) => void;
}

interface RequiredTextProps extends BaseProps {
  required: true;
  value: string;
  /** Never receives a blank value; blank drafts show an error and are not committed. */
  onChange: (value: string) => void;
}

export type TextFieldProps = OptionalTextProps | RequiredTextProps;

export const NAME_REQUIRED = "Name is required";

export function TextField(props: TextFieldProps) {
  const { label, hint, trailing, multiline = false, rows = 3, monospace = false, onBlur } = props;
  const id = useId();
  const [draft, setDraft] = useDraft<string | undefined, string>(
    props.value,
    textDraft,
    props.required ? (d) => d : optionalText,
  );
  const error = props.required && draft.trim() === "" ? NAME_REQUIRED : undefined;

  function handleChange(next: string) {
    setDraft(next);
    if (props.required) {
      if (next.trim() !== "") props.onChange(next);
    } else {
      props.onChange(optionalText(next));
    }
  }

  function handleBlur() {
    // Blur restores the last valid value of a required field (TD 7.1).
    if (error) setDraft(textDraft(props.value));
    onBlur?.();
  }

  const controlProps = {
    id,
    className: monospace ? "sa-input sa-input--mono" : "sa-input",
    value: draft,
    required: props.required,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy(id, hint, error),
    onBlur: handleBlur,
  };

  return (
    <Field id={id} label={label} hint={hint} error={error} trailing={trailing}>
      {multiline ? (
        <textarea {...controlProps} rows={rows} onChange={(event) => handleChange(event.target.value)} />
      ) : (
        <input
          {...controlProps}
          type="text"
          autoComplete="off"
          onChange={(event) => handleChange(event.target.value)}
        />
      )}
    </Field>
  );
}

export function TextAreaField(props: Omit<OptionalTextProps, "multiline">) {
  return <TextField {...props} multiline />;
}
