import { expect, test } from "@playwright/test";
import { createArchitecture, openLibrary } from "./helpers";

test("Scenario A — create a named architecture and see it in the library", async ({ page }) => {
  await openLibrary(page);
  await expect(page.getByText("No architectures yet.")).toBeVisible();

  await createArchitecture(page, "Scenario A — Empty swarm");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Library", exact: true }).click();

  const row = page.getByRole("row").filter({ has: page.getByRole("link", { name: "Scenario A — Empty swarm" }) });
  await expect(row).toContainText("0 components · 0 relationships · 0 groups");
});
