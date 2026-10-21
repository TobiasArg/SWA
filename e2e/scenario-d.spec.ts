import { expect, test } from "@playwright/test";
import {
  addComponent,
  connectViaDialog,
  createArchitecture,
  moveComponentBy,
} from "./helpers";

test("Scenario D — typed relationships have correct direction and are discoverable in the inspector", async ({ page }) => {
  await page.goto("/#/");
  await createArchitecture(page, "Scenario D — Relationships");
  await addComponent(page, "Orchestrator", "Coordinator");
  await addComponent(page, "Agent", "Research Agent");
  await addComponent(page, "Memory / Data Store", "Lead Store");
  await moveComponentBy(page, "Lead Store", 0, 300);
  await moveComponentBy(page, "Research Agent", 0, 150);

  const delegates = await connectViaDialog(page, "Coordinator", "Research Agent", "Delegates To");
  await expect(delegates.locator(".sa-edge-arrow")).toHaveCount(1);
  await expect(page.getByText("Directed (fixed by type)", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reverse direction" })).toHaveCount(0);

  const reads = await connectViaDialog(page, "Research Agent", "Lead Store", "Reads From");
  await expect(reads.locator(".sa-edge-arrow")).toHaveCount(1);
  await expect(page.getByText("Directed (fixed by type)", { exact: true })).toBeVisible();

  const shares = await connectViaDialog(page, "Research Agent", "Coordinator", "Shares Context With");
  await expect(shares.locator(".sa-edge-arrow")).toHaveCount(0);
  await expect(shares.locator(".sa-edge-path--undirected")).toHaveCount(1);
  await expect(page.getByText("Undirected (fixed by type)", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reverse direction" })).toHaveCount(0);

  const generic = await connectViaDialog(page, "Coordinator", "Lead Store", "Generic");
  await expect(generic.locator(".sa-edge-arrow")).toHaveCount(1);
  const direction = page.getByRole("radiogroup", { name: "Direction" });
  await expect(direction).toBeVisible();
  await expect(direction.getByRole("radio", { name: "Directed", exact: true })).toBeChecked();
  await expect(page.getByRole("button", { name: "Reverse direction" })).toBeVisible();

  await direction.locator("label").filter({ hasText: /^Undirected$/ }).click();
  await expect(direction.getByRole("radio", { name: "Undirected", exact: true })).toBeChecked();
  await expect(generic.locator(".sa-edge-arrow")).toHaveCount(0);
  await expect(generic.locator(".sa-edge-path--undirected")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Reverse direction" })).toHaveCount(0);
  await direction.locator("label").filter({ hasText: /^Directed$/ }).click();
  await expect(direction.getByRole("radio", { name: "Directed", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Reverse direction" }).click();
  await expect(generic.locator(".sa-edge-arrow")).toHaveCount(1);
  await expect(page.locator(".sa-rel-sentence")).toContainText("From Lead Store to Coordinator");

  await page.getByRole("button", { name: "Coordinator", exact: true }).click();
  await expect(page.locator(".sa-inspector__title")).toHaveText("Coordinator");
  const listEntries = page.getByRole("button", { name: /^Open relationship:/ });
  await expect(listEntries).toHaveCount(3);
  await expect(listEntries.filter({ hasText: "Research Agent" })).toHaveCount(2);
  await expect(listEntries.filter({ hasText: "Lead Store" })).toHaveCount(1);
  await expect(page.locator(".sa-rel-list").getByRole("button", { name: /Add|Create/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Open relationship: Coordinator delegates to Research Agent." }).click();
  await expect(page.locator(".sa-inspector__kind")).toHaveText("Relationship");
  await expect(page.locator(".sa-rel-sentence")).toContainText("From Coordinator to Research Agent");
  await expect(page.getByRole("button", { name: "Reverse direction" })).toHaveCount(0);

  await page.getByRole("button", { name: "Research Agent", exact: true }).click();
  await expect(page.locator(".sa-inspector__title")).toHaveText("Research Agent");
  const agentEntries = page.getByRole("button", { name: /^Open relationship:/ });
  await expect(agentEntries).toHaveCount(3);
  await page.getByRole("button", { name: "Open relationship: Research Agent reads from Lead Store." }).click();
  await expect(page.locator(".sa-rel-sentence")).toContainText("From Research Agent to Lead Store");
  await expect(page.getByRole("button", { name: "Reverse direction" })).toHaveCount(0);
});
