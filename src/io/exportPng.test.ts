import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanvasApi } from "../canvas/canvasApi";

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

function api(viewport: HTMLElement | null, bounds = { x: 10, y: 20, width: 400, height: 200 }): CanvasApi {
  return {
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    fitView: vi.fn(),
    screenToFlowPosition: (p) => p,
    getViewportElement: () => viewport,
    getNodesBounds: () => bounds,
  };
}

describe("computeExportFrame", () => {
  it("adds 48 px padding per side", () => {
    const frame = computeExportFrame({ x: 0, y: 0, width: 400, height: 200 });
    expect([frame.width, frame.height]).toEqual([496, 296]);
    expect(frame.transform.zoom).toBeGreaterThan(0);
  });

  it("caps the longer side at 4096 CSS px, keeping the aspect ratio", () => {
    const frame = computeExportFrame({ x: 0, y: 0, width: 10000 - 96, height: 5000 - 96 });
    expect(frame.width).toBe(4096);
    expect(frame.height).toBe(2048);
    expect(frame.transform.zoom).toBeLessThan(1);
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
    const style = options!.style as { transform: string; width: string };
    expect(style.width).toBe("496px");
    expect(style.transform).toMatch(/^translate\(.+px, .+px\) scale\(.+\)$/);
    expect(classDuringRender).toBe(true);
    expect(root.classList.contains("sa-exporting")).toBe(false);
    expect(downloaded).toEqual({ href: "data:image/png;base64,AAAA", download: "my-swarm.png" });
    expect(document.querySelector("a")).toBeNull();
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
