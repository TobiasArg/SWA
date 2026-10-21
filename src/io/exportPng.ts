/**
 * PNG export of the whole diagram (TD 10), following React Flow's "Download
 * Image" technique: render `.react-flow__viewport` with html-to-image while
 * overriding its transform so the full diagram fits the image.
 *
 * html-to-image is pinned to exactly 1.11.11 (later releases did not export
 * correctly per React Flow's example). Errors are thrown; callers show the toast.
 */
import { getViewportForBounds } from "@xyflow/react";
import { toPng } from "html-to-image";
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
  /** Viewport transform that fits `bounds` into the image. */
  transform: { x: number; y: number; zoom: number };
}

/** Image size = bounds + 48 px padding per side, scaled so no side exceeds 4096 CSS px. */
export function computeExportFrame(bounds: Rect): ExportFrame {
  const paddedWidth = bounds.width + EXPORT_PADDING * 2;
  const paddedHeight = bounds.height + EXPORT_PADDING * 2;
  const scale = Math.min(1, EXPORT_MAX_SIDE / paddedWidth, EXPORT_MAX_SIDE / paddedHeight);
  const width = Math.max(1, Math.min(EXPORT_MAX_SIDE, Math.round(paddedWidth * scale)));
  const height = Math.max(1, Math.min(EXPORT_MAX_SIDE, Math.round(paddedHeight * scale)));
  const transform = getViewportForBounds(bounds, width, height, 0.1, 2, 0.05);
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
      },
      filter: exportFilter,
    });
  } finally {
    root.classList.remove(EXPORTING_CLASS);
  }

  downloadDataUrl(dataUrl, `${slugify(name)}.png`);
}
