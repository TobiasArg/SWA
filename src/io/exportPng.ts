/**
 * PNG export of the whole diagram (TD 10), following React Flow's "Download
 * Image" technique: render `.react-flow__viewport` with html-to-image while
 * overriding its transform so the full diagram fits the image. The transform is
 * computed explicitly from the frame (UI_V2_REFINEMENT §4.2), not from React
 * Flow's viewport helper.
 *
 * html-to-image is pinned to exactly 1.11.11 (later releases did not export
 * correctly per React Flow's example). Errors are thrown; callers show the toast.
 */
import type { CanvasApi } from "../canvas/canvasApi";
import type { Rect } from "../domain/types";

export const EXPORT_PADDING = 48;
export const EXPORT_MAX_SIDE = 4096;
export const EXPORT_PIXEL_RATIO = 2;
export const EXPORTING_CLASS = "sa-exporting";

export interface ExportFrame {
  /** Image size in CSS px (before pixelRatio). */
  width: number;
  height: number;
  /** Viewport transform that places `bounds` inside the image with the margin. */
  transform: { x: number; y: number; zoom: number };
}

/**
 * Frame for `bounds` (CSS px). The 48 px margin is defined before the max-side
 * scaling: `s` shrinks the padded box, and the margin shrinks with it, so the
 * image is `48·s` px of margin on the left and top. Only the image sides are
 * clamped to 4096 px; there is no minimum zoom, so very large diagrams stay
 * complete even when they become hard to read.
 */
export function computeExportFrame(bounds: Rect): ExportFrame {
  const paddedWidth = bounds.width + EXPORT_PADDING * 2;
  const paddedHeight = bounds.height + EXPORT_PADDING * 2;
  const scale = Math.min(1, EXPORT_MAX_SIDE / paddedWidth, EXPORT_MAX_SIDE / paddedHeight);
  // The small epsilon keeps floating-point noise from adding a whole pixel.
  const width = Math.max(1, Math.min(EXPORT_MAX_SIDE, Math.ceil(paddedWidth * scale - 1e-6)));
  const height = Math.max(1, Math.min(EXPORT_MAX_SIDE, Math.ceil(paddedHeight * scale - 1e-6)));
  const transform = {
    x: (EXPORT_PADDING - bounds.x) * scale,
    y: (EXPORT_PADDING - bounds.y) * scale,
    zoom: scale,
  };
  return { width, height, transform };
}

/** File-name slug: lowercase ASCII letters, digits and dashes; never empty. */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return slug || "architecture";
}

/** Excludes connection handles from the rendered image. */
export function exportFilter(node: HTMLElement): boolean {
  return !(node instanceof HTMLElement && node.classList.contains("react-flow__handle"));
}

function canvasBackground(element: Element): string {
  const value = getComputedStyle(element).getPropertyValue("--sa-color-canvas").trim();
  return value || "white";
}

function downloadDataUrl(dataUrl: string, fileName: string): void {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
  }
}

export async function exportPng(api: CanvasApi, name: string): Promise<void> {
  const viewport = api.getViewportElement();
  if (!viewport) throw new Error("The canvas is not available for export.");

  const bounds = api.getDiagramBounds();
  if (!(bounds.width > 0 && bounds.height > 0)) throw new Error("There is nothing to export.");

  const frame = computeExportFrame(bounds);
  const root = viewport.closest(".react-flow") ?? viewport;
  const backgroundColor = canvasBackground(root);

  root.classList.add(EXPORTING_CLASS);
  let dataUrl: string;
  try {
    const { toPng } = await import("html-to-image");
    dataUrl = await toPng(viewport, {
      backgroundColor,
      width: frame.width,
      height: frame.height,
      pixelRatio: EXPORT_PIXEL_RATIO,
      skipFonts: true,
      style: {
        width: `${frame.width}px`,
        height: `${frame.height}px`,
        transform: `translate(${frame.transform.x}px, ${frame.transform.y}px) scale(${frame.transform.zoom})`,
        // The canvas fill already paints `backgroundColor`; painting it again on the scaled
        // viewport leaves a 1-level seam where its edges land on fractional pixels.
        backgroundColor: "transparent",
      },
      filter: exportFilter,
    });
  } finally {
    root.classList.remove(EXPORTING_CLASS);
  }

  downloadDataUrl(dataUrl, `${slugify(name)}.png`);
}
