import { useId } from "react";
import { Icon } from "../../ui/icons";
import type { SelectOption } from "./SelectField";

export interface SegmentedFieldProps {
  legend: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
}

/** Radio group styled as a segmented control; the active option shows a check glyph (UI 8.2). */
export function SegmentedField({ legend, value, options, onChange }: SegmentedFieldProps) {
  const name = useId();

  return (
    <fieldset className="sa-field sa-segmented" role="radiogroup" aria-labelledby={`${name}-legend`}>
      <legend className="sa-field__label" id={`${name}-legend`}>
        {legend}
      </legend>
      <div className="sa-segmented__options">
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <label key={option.value} className="sa-segmented__option" data-checked={checked}>
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
              />
              {checked ? <Icon name="check" size={14} /> : null}
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
