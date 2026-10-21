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
