import { expect, test, type Locator, type Page } from "@playwright/test";
import { addComponent, createArchitecture, modifierFor, openLibrary, waitForSaved } from "./helpers";

// ROADMAP_V2_DESIGN §6 (VS8): versions, restore with a recovery point, and one-step undo.

const NAME = "Versions flow";

const componentNames = (page: Page) => page.locator(".react-flow__node-component .sa-node__name").allTextContents();

async function openVersions(page: Page): Promise<Locator> {
  const button = page.locator(".sa-toolbar").getByRole("button", { name: "Versions", exact: true });
  await expect(button).toBeEnabled();
  await button.click();
  const dialog = page.getByRole("dialog", { name: `Versions of '${NAME}'` });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Loading versions…")).toHaveCount(0);
  return dialog;
}

function row(dialog: Locator, kind: string, counts: string): Locator {
  return dialog.locator("li.sa-versions__row").filter({ hasText: kind }).filter({ hasText: counts });
}

/** Restores a row through its confirmation and waits for the dialog to close. */
async function restore(page: Page, target: Locator): Promise<void> {
  await target.getByRole("button", { name: /^Restore the version from/ }).click();
  const confirm = page.getByRole("dialog", { name: /^Restore the version from .*\?$/ });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await confirm.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator(".sa-toast")).toContainText("Restored the version from");
  await expect(page.locator("[data-sa-canvas]")).toBeFocused();
}

async function deleteComponent(page: Page, name: string): Promise<void> {
  const node = page.locator(".react-flow__node-component").filter({ hasText: name });
  await node.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Delete");
  const confirm = page.getByRole("dialog", { name: "Delete 1 component?" });
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(node).toHaveCount(0);
}

test("restore a version, keep a Before restore version, survive reload and undo restore in one step", async ({ page }) => {
  await openLibrary(page);
  await createArchitecture(page, NAME);
  await addComponent(page, "Agent", "Alpha");
  await waitForSaved(page);

  // Leaving captures version 1 (Alpha only); reopening adds nothing new.
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("link", { name: NAME }).click();
  await expect(page.locator(".react-flow__node-component")).toHaveCount(1);

  await addComponent(page, "Tool", "Bravo");
  let dialog = await openVersions(page);
  await dialog.getByRole("button", { name: "Save version now" }).click();
  await expect(dialog.getByText("Version saved.")).toBeVisible();
  await expect(row(dialog, "Saved", "2 components")).toHaveCount(1);
  await expect(row(dialog, "Saved", "2 components").getByText("Current")).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toBeHidden();

  await deleteComponent(page, "Alpha");
  await waitForSaved(page);
  expect(await componentNames(page)).toEqual(["Bravo"]);

  dialog = await openVersions(page);
  await restore(page, row(dialog, "Automatic", "1 component ·").first());
  expect(await componentNames(page)).toEqual(["Alpha"]);
  await expect(page.getByRole("textbox", { name: "Architecture name" })).toHaveValue(NAME);

  dialog = await openVersions(page);
  const beforeRestore = row(dialog, "Before restore", "1 component · 0 relationships · 0 groups");
  await expect(beforeRestore).toHaveCount(1);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();

  await waitForSaved(page);
  await page.reload();
  await expect(page.locator(".react-flow__node-component")).toHaveCount(1);
  expect(await componentNames(page)).toEqual(["Alpha"]);

  // The recovery version outlives the session: restoring it brings back Bravo only.
  dialog = await openVersions(page);
  await restore(page, row(dialog, "Before restore", "1 component"));
  expect(await componentNames(page)).toEqual(["Bravo"]);

  // Restore Alpha again, then Mod+Z returns to the pre-restore diagram in one step.
  dialog = await openVersions(page);
  await restore(page, row(dialog, "Automatic", "1 component ·").last());
  expect(await componentNames(page)).toEqual(["Alpha"]);
  await page.keyboard.press(`${await modifierFor(page)}+z`);
  await expect.poll(() => componentNames(page)).toEqual(["Bravo"]);
  await expect(page.locator(".sa-toast")).toHaveCount(0);
});

test("the restore toast Undo reverts only the restore; Cancel restores nothing", async ({ page }) => {
  await openLibrary(page);
  await createArchitecture(page, NAME);
  await addComponent(page, "Agent", "Alpha");
  let dialog = await openVersions(page);
  await dialog.getByRole("button", { name: "Save version now" }).click();
  await expect(dialog.getByText("Version saved.")).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();

  await addComponent(page, "Tool", "Bravo");
  await waitForSaved(page);

  dialog = await openVersions(page);
  const saved = row(dialog, "Saved", "1 component");
  await saved.getByRole("button", { name: /^Restore the version from/ }).click();
  const confirm = page.getByRole("dialog", { name: /^Restore the version from .*\?$/ });
  await page.keyboard.press("Escape");
  await expect(confirm).toBeHidden();
  await expect(saved.getByRole("button", { name: /^Restore the version from/ })).toBeFocused();
  expect((await componentNames(page)).sort()).toEqual(["Alpha", "Bravo"]);

  await restore(page, saved);
  expect(await componentNames(page)).toEqual(["Alpha"]);
  await page.locator(".sa-toast").getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => (await componentNames(page)).sort()).toEqual(["Alpha", "Bravo"]);
  await expect(page.locator(".sa-live-region")).toHaveText("Undid the restore.");
});
