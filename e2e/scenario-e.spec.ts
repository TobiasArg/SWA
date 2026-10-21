import { expect, test } from "@playwright/test";
import {
  addComponent,
  componentNodeByName,
  connectViaDialog,
  createArchitecture,
  groupNodeByName,
  moveComponentBy,
  selectTwoComponents,
  waitForSaved,
} from "./helpers";

test("Scenario E — group, move, reassign, restore and delete without losing members or relationships", async ({ page }) => {
  await page.goto("/#/");
  await createArchitecture(page, "Scenario E — Groups");
  const first = await addComponent(page, "Agent", "Discovery Agent");
  await addComponent(page, "Agent", "Validation Agent");
  const third = await addComponent(page, "Agent", "Scoring Agent");
  await moveComponentBy(page, "Scoring Agent", 0, 300);
  await moveComponentBy(page, "Validation Agent", 0, 150);
  await connectViaDialog(page, "Discovery Agent", "Validation Agent", "Delegates To");

  await selectTwoComponents(page, "Discovery Agent", "Validation Agent");
  await page.getByRole("button", { name: "Group", exact: true }).click();
  let group = await groupNodeByName(page, "Group");
  await expect(group.locator(".sa-group__header")).toBeVisible();
  await expect(group.locator(".react-flow__handle")).toHaveCount(0);
  await page.getByLabel("Name", { exact: true }).fill("Research Swarm");
  group = await groupNodeByName(page, "Research Swarm");
  const groupId = await group.getAttribute("data-id");
  expect(groupId).not.toBeNull();

  await third.focus();
  await page.keyboard.press("Enter");
  const inspector = page.getByRole("region", { name: "Inspector" });
  await inspector.getByLabel("Group", { exact: true }).selectOption({ label: "Research Swarm" });
  await expect(inspector.getByLabel("Group", { exact: true })).toHaveValue(groupId!);

  const firstBeforeMove = await first.boundingBox();
  const thirdBeforeMove = await third.boundingBox();
  const header = group.locator(".sa-group__header");
  const headerBox = await header.boundingBox();
  expect(firstBeforeMove).not.toBeNull();
  expect(thirdBeforeMove).not.toBeNull();
  expect(headerBox).not.toBeNull();
  await page.mouse.move(headerBox!.x + Math.min(100, headerBox!.width / 2), headerBox!.y + headerBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(headerBox!.x + Math.min(180, headerBox!.width / 2) + 72, headerBox!.y + headerBox!.height / 2 + 48, { steps: 8 });
  await page.mouse.up();

  await expect.poll(async () => (await first.boundingBox())?.x ?? 0).toBeGreaterThan(firstBeforeMove!.x + 40);
  await expect.poll(async () => (await third.boundingBox())?.x ?? 0).toBeGreaterThan(thirdBeforeMove!.x + 40);
  await waitForSaved(page);

  const groupBeforeEscapeDrag = await group.boundingBox();
  const thirdBox = await third.boundingBox();
  expect(groupBeforeEscapeDrag).not.toBeNull();
  expect(thirdBox).not.toBeNull();
  await page.mouse.move(thirdBox!.x + thirdBox!.width / 2, thirdBox!.y + thirdBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(thirdBox!.x + thirdBox!.width / 2 + 180, thirdBox!.y + thirdBox!.height / 2 + 32, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await group.boundingBox())?.width ?? 0).toBeGreaterThan(groupBeforeEscapeDrag!.width + 100);
  await expect(page.getByRole("region", { name: "Inspector" }).getByLabel("Group", { exact: true })).toHaveValue(groupId!);

  await waitForSaved(page);
  await page.reload();
  const restoredThird = await componentNodeByName(page, "Scoring Agent");
  await restoredThird.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Inspector" }).getByLabel("Group", { exact: true })).toHaveValue(groupId!);
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);

  group = await groupNodeByName(page, "Research Swarm");
  await group.focus();
  await page.keyboard.press("Enter");
  await page.locator(".sa-toolbar").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(group).toHaveCount(0);
  await expect(page.locator(".react-flow__node-component")).toHaveCount(3);
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
});
