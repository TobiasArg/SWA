import { expect, test } from "@playwright/test";
import {
  addComponent,
  analyzePng,
  connectViaDialog,
  createArchitecture,
  downloadBuffer,
  maybeSavePng,
  moveComponentBy,
  selectTwoComponents,
} from "./helpers";

test("Scenario H — PNG export includes a grouped diagram and its SVG relationship label", async ({ page }) => {
  await page.goto("/app/#/");
  await createArchitecture(page, "Scenario H — PNG export");
  await addComponent(page, "Orchestrator", "Coordinator");
  await addComponent(page, "Agent", "Worker Agent");
  await moveComponentBy(page, "Worker Agent", 0, 320);
  await connectViaDialog(page, "Coordinator", "Worker Agent", "Delegates To");
  await page.getByLabel("Label", { exact: true }).fill("delegates research tasks");
  await expect(page.locator(".react-flow__edge-text")).toContainText("delegates research tasks");

  // v2 edges: both terminal rings and the target arrowhead are rendered before export.
  await expect(page.locator(".react-flow__edge .sa-edge-terminal")).toHaveCount(2);
  await expect(page.locator(".react-flow__edge .sa-edge-arrow")).toHaveCount(1);

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

  // UI v2: the canvas background is #F7F6F3 (the earlier v1 value #F5F3EE would make this check vacuous).
  // There is no stored image baseline for this scenario; the check is pixel-statistical.
  await maybeSavePng(png, "scenario-h.png");
  const analysis = await analyzePng(page, png);
  expect(analysis.nonBackground).toBeGreaterThan(500);
  // Nothing is cropped at the image edge, and no selection outline (#2650C8) was rendered.
  expect(analysis.touchesEdge).toBe(false);
  expect(analysis.selectionPixels).toBe(0);
});
