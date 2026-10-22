import { expect, test, type Locator, type Page } from "@playwright/test";
import { addComponent, createArchitecture, openLibrary } from "./helpers";

// ROADMAP_V2_DESIGN §2 (UT6): the deletion toast's Undo reverts only its own deletion.

const transformOf = (node: Locator) => node.evaluate((element) => (element as HTMLElement).style.transform);

async function select(page: Page, node: Locator): Promise<void> {
  await node.focus();
  await page.keyboard.press("Enter");
  await expect(node).toHaveClass(/selected/);
}

async function deleteViaToolbar(page: Page, node: Locator): Promise<void> {
  await select(page, node);
  await page.locator(".sa-toolbar").getByRole("button", { name: "Delete", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Delete 1 component?" });
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(confirm).toBeHidden();
  await expect(node).toHaveCount(0);
}

test("a later edit removes the deletion Undo toast, and each toast undoes only its own deletion", async ({ page }) => {
  await openLibrary(page);
  await createArchitecture(page, "Undo Toast Binding");
  const alpha = await addComponent(page, "Agent", "Alpha");
  const bravo = await addComponent(page, "Tool", "Bravo");
  const toast = page.locator(".sa-toast");

  await deleteViaToolbar(page, alpha);
  await expect(toast).toContainText("Deleted 1 component.");
  await expect(toast.getByRole("button", { name: "Undo", exact: true })).toBeVisible();

  const before = await transformOf(bravo);
  await select(page, bravo);
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => transformOf(bravo)).not.toBe(before);
  const moved = await transformOf(bravo);
  await expect(toast).toHaveCount(0);
  await expect(bravo).toBeVisible();
  expect(await transformOf(bravo)).toBe(moved);

  await deleteViaToolbar(page, bravo);
  await expect(toast).toContainText("Deleted 1 component.");
  await toast.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(toast).toHaveCount(0);

  await expect(page.locator(".react-flow__node-component")).toHaveCount(1);
  await expect(page.locator(".react-flow__node-component .sa-node__name")).toHaveText("Bravo");
  const restored = page.locator(".react-flow__node-component").first();
  expect(await transformOf(restored)).toBe(moved);
});
