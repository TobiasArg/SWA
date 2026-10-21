/**
 * Palette drag-and-drop onto the canvas (TD 6.3). The drop point (in flow
 * coordinates) becomes the new component's top-left; adding never changes group
 * membership, even inside a group's bounds (spec 6.6).
 */
import type { Position } from "../domain/types";
import type { EditorStore } from "../editor/storeTypes";
import { PALETTE_DRAG_MIME, addComponentAt, readPaletteDragPayload } from "../palette/paletteItems";

type TransferTypes = Pick<DataTransfer, "types"> | null | undefined;

/** True when a drag carries a palette payload (only the type list is readable during dragover). */
export function hasPalettePayload(dataTransfer: TransferTypes): boolean {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types ?? []).includes(PALETTE_DRAG_MIME);
}

interface DragLikeEvent {
  dataTransfer: DataTransfer | null;
  preventDefault(): void;
}

/** dragover: accept palette drags as a copy; ignore everything else. */
export function handlePaletteDragOver(event: DragLikeEvent): boolean {
  if (!hasPalettePayload(event.dataTransfer)) return false;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  return true;
}

/**
 * drop: validates the payload and adds ONE component at the drop point, then
 * selects it. Returns the new id, or null when the drop is not a palette item.
 */
export function handlePaletteDrop(
  store: EditorStore,
  event: DragLikeEvent & { clientX: number; clientY: number },
  screenToFlowPosition: (position: Position) => Position,
): string | null {
  if (!hasPalettePayload(event.dataTransfer)) return null;
  event.preventDefault();
  const payload = readPaletteDragPayload(event.dataTransfer);
  if (!payload) return null;
  return addComponentAt(store, payload, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
}
