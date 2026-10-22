import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanvasApi } from "../canvas/canvasApi";
import exportPngSource from "./exportPng.ts?raw";

const toPng = vi.fn<(node: HTMLElement, options?: Record<string, unknown>) => Promise<string>>();
vi.mock("html-to-image", () => ({ toPng: (node: HTMLElement, options?: Record<string, unknown>) => toPng(node, options) }));

const { computeExportFrame, exportFilter, exportPng, slugify } = await import("./exportPng");

function setupDom() {
  const root = document.createElement("div");
  root.className = "react-flow";
  root.style.setProperty("--sa-color-canvas", "#F5F3EE");
  const viewport = document.createElement("div");
  viewport.className = "react-flow__viewport";
  root.appendChild(viewport);
  document.body.appendChild(root);
  return { root, viewport };
}

function styleOf(options: Record<string, unknown> | undefined) {
  return options!.style as { transform: string; width: string };
}

function api(viewport: HTMLElement | null, bounds = { x: 10, y: 20, width: 400, height: 200 }): CanvasApi {
  return {
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    fitView: vi.fn(),
    screenToFlowPosition: (p) => p,
    getViewportElement: () => viewport,
    getNodesBounds: () => ({ x: 0, y: 0, width: 1, height: 1 }),
    getDiagramBounds: () => bounds,
  };
}

describe("computeExportFrame", () => {
  // UI_V2_REFINEMENT §4.3 vectors. `s` is the scale, (x, y) the transform offset.
  const vectors = [
    { bounds: { x: -37.5, y: 12, width: 600, height: 200 }, s: 1, w: 696, h: 296, x: 85.5, y: 36 },
    // The table rounds to 32.913; the exact offset is 49·s, so the test uses the formula.
    { bounds: { x: -1, y: -1, width: 6002, height: 90 }, s: 4096 / 6098, w: 4096, h: 125, x: (49 * 4096) / 6098, y: (49 * 4096) / 6098 },
    { bounds: { x: 0, y: 0, width: 0.5, height: 0.5 }, s: 1, w: 97, h: 97, x: 48, y: 48 },
  ];

  it.each(vectors)("matches the §4.3 vector for bounds $bounds", ({ bounds, s, w, h, x, y }) => {
    const frame = computeExportFrame(bounds);
    expect([frame.width, frame.height]).toEqual([w, h]);
    expect(frame.transform.zoom).toBeCloseTo(s, 6);
    expect(frame.transform.x).toBeCloseTo(x, 6);
    expect(frame.transform.y).toBeCloseTo(y, 6);
  });

  it.each(vectors)("keeps a 48·s margin on every side for bounds $bounds", ({ bounds }) => {
    const frame = computeExportFrame(bounds);
    const { x, y, zoom } = frame.transform;
    const margin = 48 * zoom;
    const eps = 1e-9;
    expect(bounds.x * zoom + x).toBeCloseTo(margin, 6);
    expect(bounds.y * zoom + y).toBeCloseTo(margin, 6);
    expect((bounds.x + bounds.width) * zoom + x).toBeLessThanOrEqual(frame.width - margin + eps);
    expect((bounds.y + bounds.height) * zoom + y).toBeLessThanOrEqual(frame.height - margin + eps);
  });

  it("never scales up and caps each side at 4096 CSS px", () => {
    const small = computeExportFrame({ x: 0, y: 0, width: 400, height: 200 });
    expect(small.transform.zoom).toBe(1);
    const huge = computeExportFrame({ x: 0, y: 0, width: 20000, height: 100 });
    expect(huge.width).toBe(4096);
    expect(huge.height).toBeLessThanOrEqual(4096);
    expect(huge.transform.zoom).toBeLessThan(1);
  });
});

describe("slugify", () => {
  it("creates file-safe names", () => {
    expect(slugify("Lead Gen: Swarm (v2)")).toBe("lead-gen-swarm-v2");
    expect(slugify("Café Agents")).toBe("cafe-agents");
    expect(slugify("!!!")).toBe("architecture");
  });
});

describe("exportFilter", () => {
  it("excludes React Flow handles", () => {
    const handle = document.createElement("div");
    handle.className = "react-flow__handle";
    expect(exportFilter(handle)).toBe(false);
    expect(exportFilter(document.createElement("div"))).toBe(true);
  });
});

describe("exportPng module", () => {
  it("does not import getViewportForBounds (UI_V2_REFINEMENT §4.2)", () => {
    expect(exportPngSource).not.toMatch(/getViewportForBounds/);
  });

  it("loads html-to-image only at export time", () => {
    expect(exportPngSource).toMatch(/await import\(["']html-to-image["']\)/);
    expect(exportPngSource).not.toMatch(/import\s*\{[^}]*\}\s*from\s*["']html-to-image["']/);
  });
});

describe("exportPng", () => {
  let click: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders the viewport with the fitted transform and downloads {slug}.png", async () => {
    const { root, viewport } = setupDom();
    let classDuringRender = false;
    toPng.mockImplementation(async () => {
      classDuringRender = root.classList.contains("sa-exporting");
      return "data:image/png;base64,AAAA";
    });
    let downloaded: { href: string; download: string } | null = null;
    click.mockImplementation(function (this: HTMLAnchorElement) {
      downloaded = { href: this.href, download: this.download };
    });

    await exportPng(api(viewport), "My Swarm");

    expect(toPng).toHaveBeenCalledTimes(1);
    const [node, options] = toPng.mock.calls[0]!;
    expect(node).toBe(viewport);
    expect(options).toMatchObject({ width: 496, height: 296, pixelRatio: 2, backgroundColor: "#F5F3EE" });
    expect(styleOf(options).transform).toBe("translate(38px, 28px) scale(1)");
    const style = styleOf(options);
    expect(style.width).toBe("496px");
    expect(style.transform).toMatch(/^translate\(.+px, .+px\) scale\(.+\)$/);
    expect(classDuringRender).toBe(true);
    expect(root.classList.contains("sa-exporting")).toBe(false);
    expect(downloaded).toEqual({ href: "data:image/png;base64,AAAA", download: "my-swarm.png" });
    expect(document.querySelector("a")).toBeNull();
  });

  it("sizes the image from getDiagramBounds, not getNodesBounds", async () => {
    const { viewport } = setupDom();
    toPng.mockResolvedValue("data:image/png;base64,AAAA");
    await exportPng(api(viewport, { x: 0, y: 0, width: 1000, height: 500 }), "x");
    expect(toPng.mock.calls.at(-1)![1]).toMatchObject({ width: 1096, height: 596 });
  });

  it("removes the exporting class and rethrows when rendering fails", async () => {
    const { root, viewport } = setupDom();
    toPng.mockRejectedValue(new Error("boom"));
    await expect(exportPng(api(viewport), "x")).rejects.toThrow("boom");
    expect(root.classList.contains("sa-exporting")).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });

  it("throws when there is no viewport or nothing to export", async () => {
    await expect(exportPng(api(null), "x")).rejects.toThrow();
    const { viewport } = setupDom();
    await expect(exportPng(api(viewport, { x: 0, y: 0, width: 0, height: 0 }), "x")).rejects.toThrow();
    expect(toPng).not.toHaveBeenCalled();
  });
});
