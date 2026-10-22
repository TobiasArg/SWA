import { readFile } from "node:fs/promises";
import { expect, type Download, type Locator, type Page } from "@playwright/test";

export async function openLibrary(page: Page): Promise<void> {
  await page.goto("/#/");
  await expect(page.getByRole("heading", { name: "Architectures", exact: true })).toBeVisible();
}

export async function createArchitecture(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "New architecture" }).click();
  const dialog = page.getByRole("dialog", { name: "New architecture" });
  await expect(dialog).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("textbox", { name: "Architecture name" })).toHaveValue(name);
}

export async function addComponent(page: Page, paletteLabel: string, name: string): Promise<Locator> {
  const components = page.locator(".react-flow__node-component");
  const before = await components.count();
  await page.getByRole("button", { name: paletteLabel, exact: true }).click();
  await expect(components).toHaveCount(before + 1);
  const nameField = page.getByLabel("Name", { exact: true });
  await expect(nameField).toBeVisible();
  await nameField.fill(name);
  await expect(nameField).toHaveValue(name);
  return componentNodeByName(page, name);
}

export async function moveComponentBy(page: Page, name: string, dx: number, dy: number): Promise<void> {
  const node = await componentNodeByName(page, name);
  const box = await node.boundingBox();
  expect(box, `component named ${name} should have a canvas position`).not.toBeNull();
  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY + dy, { steps: 8 });
  await page.mouse.up();
  if (Math.abs(dx) >= Math.abs(dy)) {
    await expect.poll(async () => (await node.boundingBox())?.x ?? 0).toBeGreaterThan(box!.x + dx / 2);
  } else {
    await expect.poll(async () => (await node.boundingBox())?.y ?? 0).toBeGreaterThan(box!.y + dy / 2);
  }
}

export async function componentNodeByName(page: Page, name: string): Promise<Locator> {
  const nodes = page.locator(".react-flow__node-component");
  const getId = () => nodes.evaluateAll((allNodes, wanted) => {
    const match = allNodes.find((node) => node.querySelector(".sa-node__name")?.textContent?.trim() === wanted);
    return match?.getAttribute("data-id") ?? null;
  }, name);
  await expect.poll(getId, { message: `component named ${name} should exist` }).not.toBeNull();
  const id = await getId();
  return page.locator(`.react-flow__node-component[data-id="${id}"]`);
}

export async function groupNodeByName(page: Page, name: string): Promise<Locator> {
  const nodes = page.locator(".react-flow__node");
  const getId = () => nodes.evaluateAll((allNodes, wanted) => {
    const match = allNodes.find((node) => node.querySelector(".sa-group__name")?.textContent?.trim() === wanted);
    return match?.getAttribute("data-id") ?? null;
  }, name);
  await expect.poll(getId, { message: `group named ${name} should exist` }).not.toBeNull();
  const id = await getId();
  return page.locator(`.react-flow__node[data-id="${id}"]`);
}

export async function connectViaDialog(
  page: Page,
  sourceName: string,
  targetName: string,
  typeLabel: string,
): Promise<Locator> {
  const source = await componentNodeByName(page, sourceName);
  const before = await page.locator(".react-flow__edge").count();
  await source.press("Enter");
  await expect(source).toHaveClass(/selected/);
  await page.getByRole("button", { name: "Connect…", exact: true }).first().click();

  const dialog = page.getByRole("dialog", { name: "Connect" });
  await expect(dialog).toBeVisible();
  await page.getByLabel("Relationship type", { exact: true }).selectOption({ label: typeLabel });
  await page.getByLabel("Target component", { exact: true }).selectOption({ label: targetName });
  await dialog.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".react-flow__edge")).toHaveCount(before + 1);
  return page.locator(".react-flow__edge").last();
}

export async function waitForSaved(page: Page): Promise<void> {
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10_000 });
}

export async function downloadBuffer(download: Download): Promise<Buffer> {
  const path = await download.path();
  expect(path, "download should be available from the local Playwright browser").not.toBeNull();
  return readFile(path!);
}

export async function modifierFor(page: Page): Promise<"Meta" | "Control"> {
  return page.evaluate(() => (/mac|iphone|ipad/i.test(navigator.userAgentData?.platform ?? navigator.platform) ? "Meta" : "Control"));
}

export async function selectTwoComponents(page: Page, firstName: string, secondName: string): Promise<void> {
  const first = await componentNodeByName(page, firstName);
  const second = await componentNodeByName(page, secondName);
  await page.keyboard.press("Escape");
  const firstBox = await first.boundingBox();
  const secondBox = await second.boundingBox();
  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();
  const left = Math.min(firstBox!.x, secondBox!.x) - 12;
  const top = Math.min(firstBox!.y, secondBox!.y) - 12;
  const right = Math.max(firstBox!.x + firstBox!.width, secondBox!.x + secondBox!.width) + 12;
  const bottom = Math.max(firstBox!.y + firstBox!.height, secondBox!.y + secondBox!.height) + 12;
  await page.keyboard.down("Shift");
  await page.mouse.move(left, top);
  await page.mouse.down();
  await page.mouse.move(right, bottom, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect(page.locator(".react-flow__node-component.selected")).toHaveCount(2);
}

export async function importJson(page: Page, name: string, json: string | Buffer): Promise<void> {
  const input = page.locator('input[type="file"][accept*="application/json"]');
  await input.setInputFiles({
    name,
    mimeType: "application/json",
    buffer: typeof json === "string" ? Buffer.from(json) : json,
  });
}

// ---------------------------------------------------------------------------
// UI v2 helpers (ports, curved edges, JSON snapshots)
// ---------------------------------------------------------------------------

export type PortSideName = "top" | "right" | "bottom" | "left";

export interface V2Component {
  id: string;
  type: "agent" | "tool" | "memory" | "external_system" | "decision";
  subtype?: "orchestrator";
  name: string;
  x: number;
  y: number;
  accent?: string;
}

export interface V2Relationship {
  id: string;
  type: string;
  sourceId: string;
  targetId: string;
  direction: "directed" | "undirected";
  visual?: Record<string, unknown>;
}

/** A schema v2 file with a fixed 1:1 viewport at the origin so flow and canvas coordinates differ only by the pane offset. */
export function buildV2File(
  name: string,
  components: V2Component[],
  relationships: V2Relationship[] = [],
): string {
  return JSON.stringify({
    schemaVersion: 2,
    architecture: {
      id: `arch_${name.replace(/\W+/g, "_").toLowerCase()}`,
      name,
      createdAt: "2026-10-21T09:00:00Z",
      updatedAt: "2026-10-21T09:00:00Z",
      components: components.map(({ x, y, accent, ...rest }) => ({
        ...rest,
        position: { x, y },
        ...(accent ? { accent } : {}),
      })),
      relationships,
      groups: [],
      canvas: { viewport: { x: 0, y: 0, zoom: 1 } },
    },
  });
}

/** Imports a file from the library and waits for the editor. */
export async function openImported(page: Page, name: string, json: string): Promise<void> {
  await openLibrary(page);
  await page.getByRole("button", { name: "Import JSON" }).click();
  await importJson(page, `${name}.json`, json);
  await expect(page.getByRole("textbox", { name: "Architecture name" })).toHaveValue(name);
  await expect(page.locator(".react-flow__node-component").first()).toBeVisible();
}

export interface ExportedFile {
  schemaVersion: number;
  architecture: {
    name: string;
    components: Array<Record<string, unknown>>;
    relationships: Array<{ visual?: { ports?: Record<string, string> }; sourceId: string; targetId: string }>;
    groups: Array<Record<string, unknown>>;
  };
}

export async function exportJsonFile(page: Page): Promise<{ raw: string; parsed: ExportedFile }> {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  await page.getByRole("menuitem", { name: "JSON file" }).click();
  const raw = (await downloadBuffer(await download)).toString("utf8");
  return { raw, parsed: JSON.parse(raw) as ExportedFile };
}

export function nodeById(page: Page, id: string): Locator {
  return page.locator(`.react-flow__node-component[data-id="${id}"]`);
}

export async function centerOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  expect(box, "element should have a box").not.toBeNull();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

/** Screen center of a node's port (ports are transparent until hover, but always laid out). */
export function portLocator(page: Page, nodeId: string, side: PortSideName): Locator {
  return nodeById(page, nodeId).locator(`.sa-port[data-port="${side}"]`);
}

/** Pointer drag from a port; `release` is a screen point. Leaves the picker open. */
export async function dragFromPort(
  page: Page,
  nodeId: string,
  side: PortSideName,
  release: { x: number; y: number },
  beforeRelease?: () => Promise<void>,
): Promise<void> {
  await nodeById(page, nodeId).hover();
  const from = await centerOf(portLocator(page, nodeId, side));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + release.x) / 2, (from.y + release.y) / 2, { steps: 6 });
  await page.mouse.move(release.x, release.y, { steps: 6 });
  if (beforeRelease) await beforeRelease();
  await page.mouse.up();
}

export async function chooseRelationshipType(page: Page, label: string): Promise<void> {
  const option = page.getByRole("option", { name: new RegExp(`^${label}`) });
  await expect(option).toBeVisible();
  await option.click();
}

export interface EdgeSnapshot {
  d: string;
  hasArrow: boolean;
  arrowBox: { x: number; y: number; width: number; height: number } | null;
  terminals: { terminal: string; side: string; cx: number; cy: number; r: number }[];
  dashed: boolean;
}

/** Reads the rendered geometry of the nth edge (flow coordinates for path/terminals, screen box for the arrow). */
export async function edgeSnapshot(page: Page, index = 0): Promise<EdgeSnapshot> {
  const edge = page.locator(".react-flow__edge").nth(index);
  const snapshot = await edge.evaluate((el) => {
    const path = el.querySelector(".sa-edge-path");
    const arrow = el.querySelector(".sa-edge-arrow");
    const box = arrow?.getBoundingClientRect();
    return {
      d: path?.getAttribute("d") ?? "",
      hasArrow: Boolean(arrow),
      arrowBox: box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null,
      terminals: [...el.querySelectorAll(".sa-edge-terminal")].map((c) => ({
        terminal: c.getAttribute("data-terminal") ?? "",
        side: c.getAttribute("data-side") ?? "",
        cx: Number(c.getAttribute("cx")),
        cy: Number(c.getAttribute("cy")),
        r: Number(c.getAttribute("r")),
      })),
      dashed: path?.classList.contains("sa-edge-path--undirected") ?? false,
    };
  });
  return snapshot;
}

export async function pngDimensions(png: Buffer): Promise<{ width: number; height: number }> {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

export interface PngAnalysis {
  width: number;
  height: number;
  /** Pixels that differ from the flat canvas background. */
  nonBackground: number;
  /** True when any pixel on the outer 1 px frame of the image is not background (content cropped at the edge). */
  touchesEdge: boolean;
  /** Pixels within a small tolerance of the selection accent (#2650C8). */
  selectionPixels: number;
  /** Bounding box of non-background pixels (device px). */
  content: { left: number; top: number; right: number; bottom: number } | null;
}

/** Decodes a PNG in the browser and inspects it. The canvas background is the v2 token #F7F6F3. */
export async function analyzePng(page: Page, png: Buffer, background: [number, number, number] = [247, 246, 243]): Promise<PngAnalysis> {
  return page.evaluate(
    async ({ bytes, bg }) => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(bitmap, 0, 0);
      const { data, width, height } = context.getImageData(0, 0, bitmap.width, bitmap.height);
      let nonBackground = 0;
      let selectionPixels = 0;
      let touchesEdge = false;
      let left = width;
      let top = height;
      let right = -1;
      let bottom = -1;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const i = (y * width + x) * 4;
          const r = data[i]!;
          const g = data[i + 1]!;
          const b = data[i + 2]!;
          if (Math.abs(r - 38) < 8 && Math.abs(g - 80) < 8 && Math.abs(b - 200) < 8) selectionPixels += 1;
          if (r === bg[0] && g === bg[1] && b === bg[2]) continue;
          nonBackground += 1;
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
          if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesEdge = true;
        }
      }
      return {
        width,
        height,
        nonBackground,
        touchesEdge,
        selectionPixels,
        content: right < 0 ? null : { left, top, right, bottom },
      };
    },
    { bytes: [...png], bg: background },
  );
}

/** When SA_E2E_PNG_DIR is set, also writes the PNG there so a human can review it. */
export async function maybeSavePng(png: Buffer, fileName: string): Promise<void> {
  const dir = process.env.SA_E2E_PNG_DIR;
  if (!dir) return;
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/${fileName}`, png);
}
