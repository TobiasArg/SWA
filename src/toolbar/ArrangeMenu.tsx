import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { AlignMode, ArrangeAxis, TidyScope } from "../domain/arrange";
import { Glyph, type GlyphName } from "./glyphs";
import "./toolbar.css";

/** Toolbar "Arrange" menu (roadmap v2 §5.4). Presentational: the caller owns the store actions. */
export interface ArrangeMenuProps {
  /** Selected geometric units (`countArrangeUnits`); relationships never count. */
  selectionUnits: number;
  /** What Tidy would arrange (`getTidyScope`): the selection, or the whole diagram when nothing is selected. */
  tidyScope: TidyScope;
  onAlign(mode: AlignMode): void;
  onDistribute(axis: ArrangeAxis): void;
  onTidy(): void;
}

export const ARRANGE_NOTE = "Arranges positions only. Relationships and groups are unchanged.";

const MIN_ALIGN = 2;
const MIN_DISTRIBUTE = 3;
const MIN_TIDY = 2;

interface ArrangeItem {
  key: string;
  label: string;
  glyph: GlyphName;
  enabled: boolean;
  /** Shown under the label: why the item is disabled, or what an enabled Tidy will touch. */
  hint?: string;
  run(): void;
}

const ALIGN_ITEMS: { mode: AlignMode; label: string; glyph: GlyphName }[][] = [
  [
    { mode: "left", label: "Align left", glyph: "align-left" },
    { mode: "centers", label: "Align centers", glyph: "align-centers" },
    { mode: "right", label: "Align right", glyph: "align-right" },
  ],
  [
    { mode: "top", label: "Align top", glyph: "align-top" },
    { mode: "middles", label: "Align middles", glyph: "align-middles" },
    { mode: "bottom", label: "Align bottom", glyph: "align-bottom" },
  ],
];

function tidyHint(scope: TidyScope, enabled: boolean): string {
  if (scope.kind === "diagram") return enabled ? "Whole diagram" : "Add 2 or more items";
  return enabled ? "Selection only; may overlap other items" : `Select ${MIN_TIDY} or more, or clear the selection`;
}

function buildSections({ selectionUnits, tidyScope, onAlign, onDistribute, onTidy }: ArrangeMenuProps): ArrangeItem[][] {
  const canAlign = selectionUnits >= MIN_ALIGN;
  const canDistribute = selectionUnits >= MIN_DISTRIBUTE;
  const canTidy = tidyScope.unitCount >= MIN_TIDY;
  const alignHint = canAlign ? undefined : `Select ${MIN_ALIGN} or more`;
  const distributeHint = canDistribute ? undefined : `Select ${MIN_DISTRIBUTE} or more`;

  return [
    ...ALIGN_ITEMS.map((section) =>
      section.map(({ mode, label, glyph }) => ({
        key: `align-${mode}`,
        label,
        glyph,
        enabled: canAlign,
        hint: alignHint,
        run: () => onAlign(mode),
      })),
    ),
    [
      {
        key: "distribute-horizontal",
        label: "Distribute horizontally",
        glyph: "distribute-horizontal",
        enabled: canDistribute,
        hint: distributeHint,
        run: () => onDistribute("horizontal"),
      },
      {
        key: "distribute-vertical",
        label: "Distribute vertically",
        glyph: "distribute-vertical",
        enabled: canDistribute,
        hint: distributeHint,
        run: () => onDistribute("vertical"),
      },
    ],
    [
      {
        key: "tidy",
        label: "Tidy layout",
        glyph: "tidy",
        enabled: canTidy,
        hint: tidyHint(tidyScope, canTidy),
        run: onTidy,
      },
    ],
  ];
}

const ITEM_SELECTOR = "[role='menuitem']:not(:disabled)";

export function ArrangeMenu(props: ArrangeMenuProps) {
  const [open, setOpen] = useState(false);
  // Which enabled item receives focus when the menu opens: the first, or the last (ArrowUp on the trigger).
  const [initialFocus, setInitialFocus] = useState<"first" | "last">("first");
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const noteId = useId();
  const hintIdPrefix = useId();

  const enabledItems = () => [...(menu.current?.querySelectorAll<HTMLButtonElement>(ITEM_SELECTOR) ?? [])];

  useEffect(() => {
    if (!open) return;
    const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>(ITEM_SELECTOR) ?? [])];
    // With every item disabled, focus the menu itself so Escape still closes it.
    (initialFocus === "last" ? items.at(-1) : items[0])?.focus();
    if (!items.length) menu.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, initialFocus]);

  const openMenu = (focus: "first" | "last") => {
    setInitialFocus(focus);
    setOpen(true);
  };

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (open) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openMenu(event.key === "ArrowUp" ? "last" : "first");
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    const items = enabledItems();
    if (!items.length) return;
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    let next: HTMLButtonElement | undefined;
    if (event.key === "ArrowDown") next = items[(index + 1) % items.length];
    else if (event.key === "ArrowUp") next = items[(index - 1 + items.length) % items.length];
    else if (event.key === "Home") next = items[0];
    else if (event.key === "End") next = items.at(-1);
    if (next) {
      event.preventDefault();
      next.focus();
    }
  };

  const sections = buildSections(props);

  return (
    <div className="sa-menu" ref={root} onKeyDown={open ? onMenuKeyDown : undefined}>
      <button
        ref={trigger}
        type="button"
        className="sa-button sa-button--ghost sa-toolbar__arrange"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label="Arrange"
        onClick={() => (open ? setOpen(false) : openMenu("first"))}
        onKeyDown={onTriggerKeyDown}
      >
        <Glyph name="arrange" />
        <span className="sa-toolbar__collapsible-label">Arrange</span>
        <Glyph name="chevron-down" size={12} />
      </button>
      {open ? (
        <div className="sa-menu__popover sa-arrange">
          <div
            ref={menu}
            className="sa-arrange__items"
            role="menu"
            id={menuId}
            aria-label="Arrange"
            aria-describedby={noteId}
            tabIndex={-1}
          >
            {sections.map((section, sectionIndex) => [
              sectionIndex > 0 ? (
                <div key={`separator-${sectionIndex}`} role="separator" className="sa-menu__separator" />
              ) : null,
              ...section.map((item) => {
                const hintId = item.hint ? `${hintIdPrefix}-${item.key}` : undefined;
                return (
                  <button
                    key={item.key}
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    className="sa-menu__item sa-arrange__item"
                    disabled={!item.enabled}
                    aria-describedby={hintId}
                    onClick={() => {
                      item.run();
                      close(true);
                    }}
                  >
                    <Glyph name={item.glyph} className="sa-arrange__glyph" />
                    <span className="sa-arrange__label">{item.label}</span>
                    {item.hint ? (
                      <span id={hintId} className="sa-menu__hint sa-arrange__hint" aria-hidden>
                        {item.hint}
                      </span>
                    ) : null}
                  </button>
                );
              }),
            ])}
          </div>
          <p id={noteId} className="sa-arrange__note">
            {ARRANGE_NOTE}
          </p>
        </div>
      ) : null}
    </div>
  );
}
