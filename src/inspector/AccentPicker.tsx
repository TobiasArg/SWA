import type { CSSProperties } from "react";
import { ACCENT_IDS, ACCENTS, type AccentId } from "../domain/constants";
import type { Component } from "../domain/types";
import { useInspectorCommands } from "./inspectorContext";

export const ACCENT_LEGEND = "Accent color";
export const TYPE_DEFAULT_LABEL = "Type default";

export function accentCaption(accent: AccentId | undefined): string {
  return `Accent: ${accent ? ACCENTS[accent].label : TYPE_DEFAULT_LABEL}`;
}

/** Decorative 16 px check glyph shown on the checked swatch (UI v2 §6). */
function CheckGlyph() {
  return (
    <svg
      className="sa-accent-picker__check"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3.5 8.5l3 3 6-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface AccentPickerProps {
  component: Component;
}

/**
 * Accent color picker (UI v2 §6, §11.5): a fieldset of 17 native radios. The
 * accent is decoration only (C8), so nothing is announced beyond the radio.
 */
export function AccentPicker({ component }: AccentPickerProps) {
  const commands = useInspectorCommands();
  const { id } = component;
  const current = component.accent;
  const name = `accent-${id}`;

  function choose(accent: AccentId | undefined) {
    commands.dispatch({ kind: "setComponentAccent", ids: [id], accent });
  }

  return (
    <fieldset className="sa-field sa-accent-picker">
      <legend className="sa-field__label">{ACCENT_LEGEND}</legend>
      <label className="sa-accent-picker__option sa-accent-picker__option--default" title={TYPE_DEFAULT_LABEL}>
        <input
          type="radio"
          className="sa-accent-picker__input"
          name={name}
          value=""
          checked={current === undefined}
          onChange={() => choose(undefined)}
        />
        <span
          className="sa-accent-picker__swatch"
          data-ink={component.subtype ?? component.type}
          aria-hidden="true"
        >
          <CheckGlyph />
        </span>
        <span className="sa-accent-picker__default-text">{TYPE_DEFAULT_LABEL}</span>
      </label>
      <div className="sa-accent-picker__grid">
        {ACCENT_IDS.map((accent) => {
          const { label } = ACCENTS[accent];
          const style = {
            "--sa-swatch-ink": `var(--sa-accent-${accent}-ink)`,
            "--sa-swatch-tint": `var(--sa-accent-${accent}-tint)`,
          } as CSSProperties;
          return (
            <label key={accent} className="sa-accent-picker__option" title={label}>
              <input
                type="radio"
                className="sa-accent-picker__input"
                name={name}
                value={accent}
                checked={current === accent}
                onChange={() => choose(accent)}
              />
              <span className="sa-accent-picker__swatch" style={style} aria-hidden="true">
                <CheckGlyph />
              </span>
              <span className="sa-visually-hidden">{label}</span>
            </label>
          );
        })}
      </div>
      <p className="sa-accent-picker__caption">{accentCaption(current)}</p>
    </fieldset>
  );
}
