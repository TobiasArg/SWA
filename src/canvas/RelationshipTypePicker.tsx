/**
 * Relationship type picker (TD 6.3, UI handoff 8.4): a popover (not a modal)
 * anchored near the point where a connection was released.
 *
 * - `role="listbox"` with the 10 types; each option shows the display name and a
 *   one-line "reads as" hint; Shares Context With carries an "↔ undirected" tag.
 * - ArrowUp/ArrowDown/Home/End move the active option, Enter chooses, click
 *   chooses, Escape / Tab / a pointer press outside cancel.
 * - Focus moves into the listbox on open; the caller returns it to the canvas.
 * - Keys are stopped here so the editor shortcuts (Delete, Escape → clear
 *   selection, …) never act while the picker is open.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { RELATIONSHIP_TYPES } from "../domain/constants";
import type { Position, RelationshipType } from "../domain/types";
import { readsAsHint, RELATIONSHIP_TYPE_ORDER } from "./connection";
import "./connect.css";

export const PICKER_FOOTER_HINT = "↑↓ to choose, Enter to add, Esc to cancel";
const PICKER_WIDTH = 280;
const EDGE_GAP = 8;
const POINTER_OFFSET = 12;

export interface RelationshipTypePickerProps {
  /**
   * Anchor point in client (viewport) coordinates, e.g. where the connection was
   * released. The popover is positioned inside its offset parent (the canvas)
   * and clamped to stay fully inside it.
   */
  anchor: Position;
  onChoose(type: RelationshipType): void;
  onCancel(): void;
}

/** Top-left of the popover: right/below the anchor, flipped and clamped to stay inside. */
export function placePicker(
  anchor: Position,
  size: { width: number; height: number },
  container: { width: number; height: number },
): Position {
  let x = anchor.x + POINTER_OFFSET;
  let y = anchor.y + POINTER_OFFSET;
  if (x + size.width > container.width - EDGE_GAP) x = anchor.x - POINTER_OFFSET - size.width;
  if (y + size.height > container.height - EDGE_GAP) y = anchor.y - POINTER_OFFSET - size.height;
  x = Math.max(EDGE_GAP, Math.min(x, container.width - size.width - EDGE_GAP));
  y = Math.max(EDGE_GAP, Math.min(y, container.height - size.height - EDGE_GAP));
  return { x: Math.round(x), y: Math.round(y) };
}

export function RelationshipTypePicker({ anchor, onChoose, onCancel }: RelationshipTypePickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);
  const baseId = useId();
  const optionId = (index: number) => `${baseId}-option-${index}`;
  const titleId = `${baseId}-title`;

  // Position (clamped inside the canvas) once the popover's own size is known.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const parent = (root.offsetParent as HTMLElement | null) ?? root.parentElement;
    const parentRect = parent?.getBoundingClientRect() ?? { left: 0, top: 0, width: 0, height: 0 };
    const rect = root.getBoundingClientRect();
    const place = placePicker(
      { x: anchor.x - parentRect.left, y: anchor.y - parentRect.top },
      { width: rect.width || PICKER_WIDTH, height: rect.height },
      { width: parentRect.width, height: parentRect.height },
    );
    root.style.left = `${place.x}px`;
    root.style.top = `${place.y}px`;
  }, [anchor]);

  useEffect(() => {
    listRef.current?.focus({ preventScroll: true });
  }, []);

  // A pointer press outside the popover cancels it.
  const cancelRef = useRef(onCancel);
  useEffect(() => {
    cancelRef.current = onCancel;
  }, [onCancel]);
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && event.target instanceof Node && rootRef.current.contains(event.target)) return;
      cancelRef.current();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  useEffect(() => {
    document.getElementById(optionId(active))?.scrollIntoView?.({ block: "nearest" });
  });

  const last = RELATIONSHIP_TYPE_ORDER.length - 1;
  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    event.stopPropagation();
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((index) => Math.min(last, index + 1));
        return;
      case "ArrowUp":
        event.preventDefault();
        setActive((index) => Math.max(0, index - 1));
        return;
      case "Home":
        event.preventDefault();
        setActive(0);
        return;
      case "End":
        event.preventDefault();
        setActive(last);
        return;
      case "Enter":
      case " ": {
        event.preventDefault();
        const type = RELATIONSHIP_TYPE_ORDER[active];
        if (type) onChoose(type);
        return;
      }
      case "Escape":
      case "Tab":
        event.preventDefault();
        onCancel();
        return;
      default:
      // Other keys stop here (stopPropagation above), so editor shortcuts
      // such as Delete or C never act while the picker is open.
    }
  };

  return (
    <div ref={rootRef} className="sa-type-picker">
      <p className="sa-type-picker__title" id={titleId}>
        Relationship type
      </p>
      <ul
        ref={listRef}
        className="sa-type-picker__list"
        role="listbox"
        tabIndex={0}
        aria-labelledby={titleId}
        aria-activedescendant={optionId(active)}
        onKeyDown={onKeyDown}
      >
        {RELATIONSHIP_TYPE_ORDER.map((type, index) => (
          <li
            key={type}
            id={optionId(index)}
            role="option"
            aria-selected={index === active}
            className="sa-type-picker__option"
            data-active={index === active ? "true" : undefined}
            onPointerMove={() => setActive(index)}
            onClick={() => onChoose(type)}
          >
            <span className="sa-type-picker__name">
              {RELATIONSHIP_TYPES[type].label}
              {RELATIONSHIP_TYPES[type].direction === "undirected" ? (
                <span className="sa-type-picker__tag">↔ undirected</span>
              ) : null}
            </span>
            <span className="sa-type-picker__hint">{readsAsHint(type)}</span>
          </li>
        ))}
      </ul>
      <p className="sa-type-picker__footer" aria-hidden="true">
        {PICKER_FOOTER_HINT}
      </p>
    </div>
  );
}
