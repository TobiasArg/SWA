import { expect, test } from "@playwright/test";
import {
  addComponent,
  connectViaDialog,
  createArchitecture,
  downloadBuffer,
  moveComponentBy,
  selectTwoComponents,
} from "./helpers";

test("Scenario J — the core workflow makes no requests outside the local app", async ({ page }) => {
  const externalRequests: string[] = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === "http://127.0.0.1:4173") {
      await route.continue();
      return;
    }
    externalRequests.push(url.href);
    await route.abort();
  });

  await page.goto("/#/");
  await createArchitecture(page, "Scenario J — Offline workflow");
  await addComponent(page, "Orchestrator", "Offline Coordinator");
  await addComponent(page, "Agent", "Offline Agent");
  await moveComponentBy(page, "Offline Agent", 0, 200);
  await connectViaDialog(page, "Offline Coordinator", "Offline Agent", "Delegates To");
  await page.getByLabel("Label", { exact: true }).fill("local-only handoff");
  await selectTwoComponents(page, "Offline Coordinator", "Offline Agent");
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Offline Swarm");

  const jsonDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  await page.getByRole("menuitem", { name: "JSON file" }).click();
  const json = await downloadBuffer(await jsonDownload);
  expect(JSON.parse(json.toString("utf8"))).toHaveProperty("architecture.groups");

  const pngDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  await page.getByRole("menuitem", { name: "PNG image" }).click();
  const png = await downloadBuffer(await pngDownload);
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

  await expect.poll(() => externalRequests).toEqual([]);
});
