import { expect, test } from "@playwright/test";
import {
  addComponent,
  componentNodeByName,
  connectViaDialog,
  createArchitecture,
  groupNodeByName,
  moveComponentBy,
  selectTwoComponents,
} from "./helpers";

test("Scenario I — deleting a component cascades and undo/redo restores the complete state", async ({ page }) => {
  await page.goto("/#/");
  await createArchitecture(page, "Scenario I — Undo and redo");
  await addComponent(page, "Agent", "Source Agent");
  await addComponent(page, "Memory / Data Store", "Lead Store");
  await moveComponentBy(page, "Lead Store", 0, 200);
  await connectViaDialog(page, "Source Agent", "Lead Store", "Writes To");
  await selectTwoComponents(page, "Source Agent", "Lead Store");
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Pipeline Group");
  const group = await groupNodeByName(page, "Pipeline Group");
  const groupId = await group.getAttribute("data-id");
  expect(groupId).not.toBeNull();

  const component = await componentNodeByName(page, "Source Agent");
  await component.focus();
  await page.keyboard.press("Enter");
  const toolbarDelete = page.locator(".sa-toolbar").getByRole("button", { name: "Delete", exact: true });
  const confirm = page.getByRole("dialog", { name: "Delete 1 component and 1 relationship?" });
  await toolbarDelete.click();
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(confirm).toBeHidden();
  await expect(component).toHaveCount(1);
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await expect(toolbarDelete).toBeFocused();
  await toolbarDelete.click();
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(confirm).toBeHidden();
  await expect(component).toHaveCount(0);
  await expect(page.locator(".react-flow__edge")).toHaveCount(0);
  await expect(page.locator(`.react-flow__node[data-id="${groupId}"] .sa-group__count`)).toHaveText("1 MEMBER");

  await page.locator(".sa-toolbar").getByRole("button", { name: "Undo", exact: true }).click();
  const restoredComponent = await componentNodeByName(page, "Source Agent");
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await expect(page.locator(`.react-flow__node[data-id="${groupId}"] .sa-group__count`)).toHaveText("2 MEMBERS");
  await restoredComponent.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Inspector" }).getByLabel("Group", { exact: true })).toHaveValue(groupId!);

  await page.locator(".sa-toolbar").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(restoredComponent).toHaveCount(0);
  await expect(page.locator(".react-flow__edge")).toHaveCount(0);
  await expect(page.locator(`.react-flow__node[data-id="${groupId}"] .sa-group__count`)).toHaveText("1 MEMBER");
});
