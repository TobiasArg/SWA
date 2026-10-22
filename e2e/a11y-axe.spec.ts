import { expect, test } from "@playwright/test";
import {
  addComponent,
  componentNodeByName,
  connectViaDialog,
  createArchitecture,
  groupNodeByName,
  moveComponentBy,
  openLibrary,
  selectTwoComponents,
} from "./helpers";
import { expectNoA11yViolations } from "./axe";

async function returnToLibrary(page: import("@playwright/test").Page): Promise<void> {
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Architectures", exact: true })).toBeVisible();
}

test("library empty screen and backup notice have no axe violations", async ({ page }) => {
  await openLibrary(page);
  await expect(page.getByText("No architectures yet.")).toBeVisible();
  await expect(page.locator(".sa-library__notice")).toBeVisible();
  await expectNoA11yViolations(page);
});

test("library with three architectures has no axe violations", async ({ page }) => {
  await openLibrary(page);
  for (const name of ["Axe architecture one", "Axe architecture two", "Axe architecture three"]) {
    await createArchitecture(page, name);
    await returnToLibrary(page);
  }
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await expectNoA11yViolations(page);
});

test("library New architecture dialog has no axe violations", async ({ page }) => {
  await openLibrary(page);
  await page.getByRole("button", { name: "New architecture" }).click();
  await expect(page.getByRole("dialog", { name: "New architecture" })).toBeVisible();
  await expectNoA11yViolations(page);
});

test("library Rename dialog has no axe violations", async ({ page }) => {
  await openLibrary(page);
  await createArchitecture(page, "Axe rename target");
  await returnToLibrary(page);
  await page.getByRole("button", { name: "Rename Axe rename target" }).click();
  await expect(page.getByRole("dialog", { name: "Rename architecture" })).toBeVisible();
  await expectNoA11yViolations(page);
});

test("library delete confirmation has no axe violations", async ({ page }) => {
  await openLibrary(page);
  await createArchitecture(page, "Axe delete target");
  await returnToLibrary(page);
  await page.getByRole("button", { name: "Delete Axe delete target" }).click();
  await expect(page.getByRole("dialog", { name: "Delete 'Axe delete target'?" })).toBeVisible();
  await expectNoA11yViolations(page);
});

test("invalid library import dialog has no axe violations", async ({ page }) => {
  await openLibrary(page);
  await page.getByRole("button", { name: "Import JSON" }).click();
  await page.locator('input[type="file"][accept*="application/json"]').setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from("not an architecture file"),
  });
  await expect(page.getByRole("dialog", { name: "This file can't be imported" })).toBeVisible();
  await expectNoA11yViolations(page);
});

test("empty editor canvas has no axe violations", async ({ page }) => {
  await openLibrary(page);
  await createArchitecture(page, "Axe empty editor");
  await expect(page.locator("[data-sa-canvas]")).toBeVisible();
  await expectNoA11yViolations(page);
});

test("editor component and multi-selection inspectors have no axe violations", async ({ page }) => {
  await openLibrary(page);
  await createArchitecture(page, "Axe inspector selections");
  await addComponent(page, "Agent", "Axe first component");
  await addComponent(page, "Tool", "Axe second component");
  await moveComponentBy(page, "Axe second component", 240, 180);

  const first = await componentNodeByName(page, "Axe first component");
  await first.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Inspector" })).toContainText("Axe first component");
  await expectNoA11yViolations(page);

  await selectTwoComponents(page, "Axe first component", "Axe second component");
  await expect(page.getByRole("region", { name: "Inspector" })).toContainText("2 components, 0 relationships, 0 groups selected");
  await expectNoA11yViolations(page);
});

test("editor relationships, groups, Connect dialog and their inspectors have no axe violations", async ({ page }) => {
  await openLibrary(page);
  await createArchitecture(page, "Axe structured editor");
  await addComponent(page, "Agent", "Axe source");
  await addComponent(page, "Tool", "Axe target");
  await moveComponentBy(page, "Axe target", 240, 180);

  const source = await componentNodeByName(page, "Axe source");
  await source.focus();
  await page.keyboard.press("Enter");
  await page.locator(".sa-toolbar").getByRole("button", { name: "Connect…", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Connect" })).toBeVisible();
  await expectNoA11yViolations(page);
  await page.getByRole("dialog", { name: "Connect" }).getByRole("button", { name: "Cancel" }).click();

  const edge = await connectViaDialog(page, "Axe source", "Axe target", "Generic");
  await expect(edge).toBeVisible();
  await expect(page.getByRole("region", { name: "Inspector" })).toContainText("Relationship");
  await expectNoA11yViolations(page);

  await selectTwoComponents(page, "Axe source", "Axe target");
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Axe group");
  const group = await groupNodeByName(page, "Axe group");
  await expect(group).toBeVisible();
  await expect(page.getByRole("region", { name: "Inspector" })).toContainText("Members (2)");
  await expectNoA11yViolations(page);
});

test("editor delete confirmation has no axe violations", async ({ page }) => {
  await openLibrary(page);
  await createArchitecture(page, "Axe editor delete confirmation");
  await addComponent(page, "Agent", "Axe delete component");
  const component = await componentNodeByName(page, "Axe delete component");
  await component.focus();
  await page.keyboard.press("Enter");
  await page.locator(".sa-toolbar").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator("dialog[open]")).toBeVisible();
  await expectNoA11yViolations(page);
});

test("editor ungroup confirmation has no axe violations", async ({ page }) => {
  await openLibrary(page);
  await createArchitecture(page, "Axe ungroup confirmation");
  await addComponent(page, "Agent", "Axe group member one");
  await addComponent(page, "Tool", "Axe group member two");
  await moveComponentBy(page, "Axe group member two", 240, 180);
  await selectTwoComponents(page, "Axe group member one", "Axe group member two");
  await page.getByRole("button", { name: "Group", exact: true }).click();
  const group = await groupNodeByName(page, "Group");
  await group.focus();
  await page.keyboard.press("Enter");
  await page.locator(".sa-toolbar").getByRole("button", { name: "Ungroup", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Ungroup 1 group?" })).toBeVisible();
  await expectNoA11yViolations(page);
});

test("editor Export menu has no axe violations", async ({ page }) => {
  await openLibrary(page);
  await createArchitecture(page, "Axe export menu");
  await page.getByRole("button", { name: "Export" }).click();
  await expect(page.getByRole("menu", { name: "Export" })).toBeVisible();
  await expectNoA11yViolations(page);
});

test("editor delete toast has no axe violations", async ({ page }) => {
  await openLibrary(page);
  await createArchitecture(page, "Axe toast");
  await addComponent(page, "Agent", "Axe toast component");
  const component = await componentNodeByName(page, "Axe toast component");
  await component.focus();
  await page.keyboard.press("Enter");
  await page.locator(".sa-toolbar").getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator(".sa-toast")).toBeVisible();
  await expectNoA11yViolations(page);
});
