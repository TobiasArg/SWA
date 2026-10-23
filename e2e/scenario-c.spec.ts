import { expect, test } from "@playwright/test";
import { addComponent, createArchitecture, waitForSaved } from "./helpers";

test("Scenario C — edit all Agent behavior fields and restore them after reload", async ({ page }) => {
  await page.goto("/app/#/");
  await createArchitecture(page, "Scenario C — Behavior");
  await addComponent(page, "Agent", "Discovery Agent");

  const fields: Record<string, string> = {
    Description: "Finds candidate companies that match the target profile.",
    Purpose: "Find qualified businesses.",
    Role: "Researcher",
    Responsibilities: "Search public sources\nRecord evidence",
    Boundaries: "Does not contact prospects",
    Activation: "Starts with a new search request.",
    "Behavioral rules": "Use cited evidence\nFlag uncertainty",
    Delegation: "Ask the orchestrator for review.",
    Outputs: "A validated lead list.",
    "Failure handling": "Report an empty result and retry once.",
  };

  await page.locator(".sa-inspector__section").filter({ has: page.locator("summary", { hasText: "Responsibilities" }) }).locator("summary").click();
  await page.locator(".sa-inspector__section").filter({ has: page.locator("summary", { hasText: "Behavior" }) }).locator("summary").click();

  for (const [label, value] of Object.entries(fields)) {
    await page.getByLabel(label, { exact: true }).fill(value);
  }
  await waitForSaved(page);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Architecture name" })).toHaveValue("Scenario C — Behavior");
  await (await page.locator(".react-flow__node-component").first()).click();
  for (const [label, value] of Object.entries(fields)) {
    await expect(page.getByLabel(label, { exact: true })).toHaveValue(value);
  }
});
