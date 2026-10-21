import { expect, test } from "@playwright/test";
import {
  addComponent,
  connectViaDialog,
  createArchitecture,
  downloadBuffer,
  moveComponentBy,
  selectTwoComponents,
} from "./helpers";

test("Scenario H — PNG export includes a grouped diagram and its SVG relationship label", async ({ page }) => {
  await page.goto("/#/");
  await createArchitecture(page, "Scenario H — PNG export");
  await addComponent(page, "Orchestrator", "Coordinator");
  await addComponent(page, "Agent", "Worker Agent");
  await moveComponentBy(page, "Worker Agent", 0, 200);
  await connectViaDialog(page, "Coordinator", "Worker Agent", "Delegates To");
  await page.getByLabel("Label", { exact: true }).fill("delegates research tasks");
  await expect(page.locator(".react-flow__edge-text")).toContainText("delegates research tasks");

  await selectTwoComponents(page, "Coordinator", "Worker Agent");
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Research Swarm");
  await expect(page.locator(".sa-group__header")).toContainText("Research Swarm");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  await page.getByRole("menuitem", { name: "PNG image" }).click();
  const png = await downloadBuffer(await downloadPromise);
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  expect(width).toBeGreaterThan(0);
  expect(height).toBeGreaterThan(0);
  expect(width).toBeLessThanOrEqual(8192);
  expect(height).toBeLessThanOrEqual(8192);

  const rasterHasDiagramPixels = await page.evaluate(async (bytes) => {
    const blob = new Blob([new Uint8Array(bytes)], { type: "image/png" });
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) return false;
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    let nonBackgroundPixels = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] !== 245 || data[index + 1] !== 243 || data[index + 2] !== 238) nonBackgroundPixels += 1;
    }
    return nonBackgroundPixels > 500;
  }, [...png]);
  expect(rasterHasDiagramPixels).toBe(true);
});
