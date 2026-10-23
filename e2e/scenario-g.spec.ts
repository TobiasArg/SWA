import { expect, test } from "@playwright/test";
import {
  addComponent,
  connectViaDialog,
  createArchitecture,
  downloadBuffer,
  importJson,
  moveComponentBy,
  selectTwoComponents,
  waitForSaved,
} from "./helpers";

test("Scenario G — JSON round-trip preserves content and invalid imports save nothing", async ({ page }) => {
  await page.goto("/app/#/");
  await createArchitecture(page, "Scenario G — Round trip");
  await addComponent(page, "Agent", "Source Agent");
  await addComponent(page, "Memory / Data Store", "Shared Store");
  await moveComponentBy(page, "Shared Store", 0, 200);
  await connectViaDialog(page, "Source Agent", "Shared Store", "Generic");
  await page.getByLabel("Label", { exact: true }).fill("stores validated records");
  await selectTwoComponents(page, "Source Agent", "Shared Store");
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Data pipeline");
  await waitForSaved(page);

  const exportDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  await page.getByRole("menuitem", { name: "JSON file" }).click();
  const firstJson = await downloadBuffer(await exportDownload);
  const original = JSON.parse(firstJson.toString("utf8")) as {
    architecture: { components: unknown[]; relationships: unknown[]; groups: unknown[]; canvas?: unknown };
  };

  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: "Import JSON" }).click();
  await importJson(page, "scenario-g.json", firstJson);
  await expect(page.getByRole("textbox", { name: "Architecture name" })).toHaveValue(
    "Scenario G — Round trip (imported)",
  );

  const reexportDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  await page.getByRole("menuitem", { name: "JSON file" }).click();
  const roundTripJson = await downloadBuffer(await reexportDownload);
  const roundTrip = JSON.parse(roundTripJson.toString("utf8")) as typeof original;
  expect(roundTrip.architecture.components).toEqual(original.architecture.components);
  expect(roundTrip.architecture.relationships).toEqual(original.architecture.relationships);
  expect(roundTrip.architecture.groups).toEqual(original.architecture.groups);
  expect(roundTrip.architecture.canvas).toEqual(original.architecture.canvas);

  await page.getByRole("button", { name: "Library", exact: true }).click();
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(2);
  const beforeInvalid = await rows.count();
  const invalid = structuredClone(original);
  const relationship = invalid.architecture.relationships[0] as { targetId?: string };
  relationship.targetId = "cmp_missing_target";
  await page.getByRole("button", { name: "Import JSON" }).click();
  await importJson(page, "dangling-relationship.json", JSON.stringify(invalid));
  const errorDialog = page.getByRole("dialog", { name: "This file can't be imported" });
  await expect(errorDialog).toBeVisible();
  await expect(errorDialog).toContainText("Nothing was saved.");
  await expect(rows).toHaveCount(beforeInvalid);
});
