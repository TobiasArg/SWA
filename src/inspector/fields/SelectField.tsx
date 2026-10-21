import { useId } from "react";
import { describedBy, Field } from "./Field";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps {
  label: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  hint?: string;
}

export function SelectField({ label, value, options, onChange, hint }: SelectFieldProps) {
  const id = useId();

  return (
    <Field id={id} label={label} hint={hint}>
      <select
        id={id}
        className="sa-input sa-select"
        value={value}
        aria-describedby={describedBy(id, hint)}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
