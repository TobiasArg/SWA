import { useId } from "react";
import { ACCENT_IDS, ACCENTS, type AccentId } from "../domain/constants";
import { typePaletteId, type PaletteId } from "../domain/palette";
import type { Component } from "../domain/types";
import { useInspectorCommands } from "./inspectorContext";

export const ACCENT_LEGEND = "Color";
export const TYPE_DEFAULT_LABEL = "Type default";

export function accentCaption(accent: AccentId | undefined): string {
  return `Color: ${accent ? ACCENTS[accent].label : TYPE_DEFAULT_LABEL}`;
}

/** Usage key for components without an `accent` (the type default). */
export const DEFAULT_USAGE_KEY = "default";
export type AccentUsageKey = AccentId | typeof DEFAULT_USAGE_KEY;

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

export interface AccentRadioGroupProps {
  name: string;
  /** The shared accent, `undefined` for the type default, or "mixed" when values differ (none checked). */
  value: AccentId | undefined | "mixed";
  /** Palette entry for the Type default swatch; `null` renders the neutral swatch (mixed types). */
  defaultPaletteId: PaletteId | null;
  /** How many of `total` components use each value; only rendered when given. */
  usage?: ReadonlyMap<AccentUsageKey, number>;
  total?: number;
  /** Overrides the caption (the mixed state). */
  caption?: string;
  onChoose(accent: AccentId | undefined): void;
}

/**
 * Presentational color radios (UI v2 §6, §11.5; UI_COLOR_CONFIRMATION_DESIGN §1.8;
 * Roadmap v2 §4.3): a fieldset of 17 native radios. Each swatch sets `data-palette`
 * to the entry the node would use, so swatch and node share one CSS source.
 */
export function AccentRadioGroup({
  name,
  value,
  defaultPaletteId,
  usage,
  total = 0,
  caption,
  onChoose,
}: AccentRadioGroupProps) {
  const captionId = useId();
  // Usage marks (Roadmap v2 §4.1): a decorative corner dot in the swatch plus hidden
  // text. The text joins the label in one node so every engine computes the same name.
  const usageDot = (key: AccentUsageKey) =>
    usage?.get(key) ? <span className="sa-accent-picker__usage" /> : null;
  const usageText = (key: AccentUsageKey) => {
    const used = usage?.get(key);
    return used ? `, used by ${used} of ${total}` : "";
  };
  const defaultUsage = usageText(DEFAULT_USAGE_KEY);
  const defaultSwatchClass = `sa-accent-picker__swatch${defaultPaletteId ? "" : " sa-accent-picker__swatch--neutral"}`;

  return (
    <fieldset className="sa-field sa-accent-picker" aria-describedby={captionId}>
      <legend className="sa-field__label">{ACCENT_LEGEND}</legend>
      <label className="sa-accent-picker__option sa-accent-picker__option--default" title={TYPE_DEFAULT_LABEL}>
        <input
          type="radio"
          className="sa-accent-picker__input"
          name={name}
          value=""
          checked={value === undefined}
          onChange={() => onChoose(undefined)}
        />
        <span className={defaultSwatchClass} data-palette={defaultPaletteId ?? undefined} aria-hidden="true">
          <CheckGlyph />
          {usageDot(DEFAULT_USAGE_KEY)}
        </span>
        {defaultUsage ? (
          <>
            <span className="sa-accent-picker__default-text" aria-hidden="true">
              {TYPE_DEFAULT_LABEL}
            </span>
            <span className="sa-visually-hidden">{`${TYPE_DEFAULT_LABEL}${defaultUsage}`}</span>
          </>
        ) : (
          <span className="sa-accent-picker__default-text">{TYPE_DEFAULT_LABEL}</span>
        )}
      </label>
      <div className="sa-accent-picker__grid">
        {ACCENT_IDS.map((accent) => {
          const { label } = ACCENTS[accent];
          return (
            <label key={accent} className="sa-accent-picker__option" title={label}>
              <input
                type="radio"
                className="sa-accent-picker__input"
                name={name}
                value={accent}
                checked={value === accent}
                onChange={() => onChoose(accent)}
              />
              <span className="sa-accent-picker__swatch" data-palette={accent} aria-hidden="true">
                <CheckGlyph />
                {usageDot(accent)}
              </span>
              <span className="sa-visually-hidden">{`${label}${usageText(accent)}`}</span>
            </label>
          );
        })}
      </div>
      <p id={captionId} className="sa-accent-picker__caption">
        {caption ?? accentCaption(value === "mixed" ? undefined : value)}
      </p>
    </fieldset>
  );
}

export interface AccentPickerProps {
  component: Component;
}

/**
 * Single-component color picker. The persisted field stays `accent`. Color is
 * decoration only (C8), so nothing is announced beyond the radio.
 */
export function AccentPicker({ component }: AccentPickerProps) {
  const commands = useInspectorCommands();
  const { id } = component;

  return (
    <AccentRadioGroup
      name={`accent-${id}`}
      value={component.accent}
      defaultPaletteId={typePaletteId(component)}
      onChoose={(accent) => commands.dispatch({ kind: "setComponentAccent", ids: [id], accent })}
    />
  );
}
