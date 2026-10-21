import { useId, useRef, type DragEvent } from "react";
import { useCanvasApi } from "../canvas/canvasApi";
import { DUPLICATE_OFFSET } from "../domain/constants";
import type { Position } from "../domain/types";
import { useEditorStore } from "../editor/context";
import type { EditorState } from "../editor/storeTypes";
import { Icon } from "../ui/icons";
import {
  PALETTE_ITEMS,
  addComponentAt,
  centeredTopLeft,
  writePaletteDragPayload,
  type PaletteItem,
} from "./paletteItems";
import "./palette.css";

export const PALETTE_HINT = "Click to place at the center of the canvas, or drag onto the canvas.";

export interface PaletteProps {
  /** Icon-only rail (48px); names move to aria-label and a tooltip. */
  collapsed?: boolean;
}

interface LastClickAdd {
  center: Position;
  state: EditorState;
  count: number;
}

/**
 * Component library (left panel, TD 6.3 and handoff 10.1).
 *
 * Click-add offset rule: each consecutive click-add moves the new component by
 * +24px on x and y. The run continues only while (a) the canvas center in flow
 * coordinates is unchanged (no pan or zoom) and (b) the editor state snapshot is
 * the exact object left behind by the previous click-add (any other change in
 * between — edits, moves, undo, selection, viewport — produces a new snapshot).
 * Otherwise the offset resets to zero.
 */
export function Palette({ collapsed = false }: PaletteProps) {
  const store = useEditorStore();
  const api = useCanvasApi();
  const hintId = useId();
  const headingId = useId();
  const lastClickAdd = useRef<LastClickAdd | null>(null);

  const canvasCenter = (): Position => {
    const rect = api.getViewportElement()?.closest(".react-flow")?.getBoundingClientRect();
    const screen = rect
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    return api.screenToFlowPosition(screen);
  };

  const handleClick = (item: PaletteItem) => {
    const center = canvasCenter();
    const previous = lastClickAdd.current;
    const continues =
      previous !== null &&
      previous.state === store.getState() &&
      previous.center.x === center.x &&
      previous.center.y === center.y;
    const count = continues ? previous.count + 1 : 0;

    const base = centeredTopLeft(item, center);
    const id = addComponentAt(store, item, {
      x: base.x + count * DUPLICATE_OFFSET.x,
      y: base.y + count * DUPLICATE_OFFSET.y,
    });

    lastClickAdd.current = id === null ? null : { center, state: store.getState(), count };
  };

  const handleDragStart = (event: DragEvent<HTMLButtonElement>, item: PaletteItem) => {
    writePaletteDragPayload(event.dataTransfer, { type: item.type, subtype: item.subtype });
  };

  return (
    <nav
      className={`sa-palette${collapsed ? " sa-palette--collapsed" : ""}`}
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className={collapsed ? "sa-palette__sr-only" : "sa-palette__heading"}>
        Components
      </h2>
      <p id={hintId} className="sa-palette__sr-only">
        {PALETTE_HINT}
      </p>
      <ul className="sa-palette__list">
        {PALETTE_ITEMS.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              className={`sa-palette__item sa-palette__item--${item.key}`}
              draggable
              aria-describedby={hintId}
              aria-label={collapsed ? item.label : undefined}
              title={collapsed ? item.label : undefined}
              onClick={() => handleClick(item)}
              onDragStart={(event) => handleDragStart(event, item)}
            >
              <Icon name={item.icon} size={20} className="sa-palette__icon" />
              {collapsed ? null : <span className="sa-palette__label">{item.label}</span>}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
