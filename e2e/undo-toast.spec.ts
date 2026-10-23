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

async function renameComponent(page: Page, node: Locator, name: string): Promise<void> {
  const nameField = page.getByLabel("Name", { exact: true });
  await expect(nameField).toBeVisible();
  await nameField.fill(name);
  await expect(node.locator(".sa-node__name")).toHaveText(name);
}

async function toastMetrics(page: Page): Promise<{
  viewportWidth: number;
  documentWidth: number;
  bodyWidth: number;
  toastLeft: number;
  toastRight: number;
  toastWidth: number;
  toastHeight: number;
  toastMaxWidth: number;
  toastDisplay: string;
  messageFontSize: string;
  messageOverflowWrap: string;
  messageWidth: number;
  messageHeight: number;
  messageLineHeight: number;
  messageClientWidth: number;
  messageScrollWidth: number;
  undoBackgroundColor: string;
  undoRight: number;
}> {
  return page.locator(".sa-toast").evaluate((element) => {
    const message = element.querySelector<HTMLElement>(".sa-toast__message")!;
    const undo = element.querySelector<HTMLElement>(".sa-toast__action")!;
    const toastStyle = getComputedStyle(element);
    const messageStyle = getComputedStyle(message);
    const toastBox = element.getBoundingClientRect();
    const messageBox = message.getBoundingClientRect();
    const undoBox = undo.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      toastLeft: toastBox.left,
      toastRight: toastBox.right,
      toastWidth: toastBox.width,
      toastHeight: toastBox.height,
      toastMaxWidth: Number.parseFloat(toastStyle.maxWidth.match(/[\d.]+px/)?.[0] ?? ""),
      toastDisplay: toastStyle.display,
      messageFontSize: messageStyle.fontSize,
      messageOverflowWrap: messageStyle.overflowWrap,
      messageWidth: messageBox.width,
      messageHeight: messageBox.height,
      messageLineHeight: Number.parseFloat(messageStyle.lineHeight),
      messageClientWidth: message.clientWidth,
      messageScrollWidth: message.scrollWidth,
      undoBackgroundColor: getComputedStyle(undo).backgroundColor,
      undoRight: undoBox.right,
    };
  });
}

async function expectCompactToast(page: Page, maxWidth: number): Promise<Awaited<ReturnType<typeof toastMetrics>>> {
  const metrics = await toastMetrics(page);
  expect(metrics.toastDisplay).toBe("flex");
  expect(metrics.toastMaxWidth).toBeLessThanOrEqual(480);
  expect(metrics.toastWidth).toBeGreaterThan(0);
  expect(metrics.toastWidth).toBeLessThanOrEqual(maxWidth);
  expect(metrics.toastHeight).toBeGreaterThan(0);
  expect(metrics.messageFontSize).toBe("13px");
  expect(metrics.undoBackgroundColor).toBe("rgb(38, 80, 200)");
  return metrics;
}

test("a later edit removes the deletion Undo toast, and each toast undoes only its own deletion", async ({ page }) => {
  await openLibrary(page);
  await createArchitecture(page, "Undo Toast Binding");
  const alpha = await addComponent(page, "Agent", "Alpha");
  const bravo = await addComponent(page, "Tool", "Bravo");
  const toast = page.locator(".sa-toast");

  await deleteViaToolbar(page, alpha);
  await expect(toast).toContainText("Deleted Alpha.");
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
  await expect(toast).toContainText("Deleted Bravo.");
  await toast.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(toast).toHaveCount(0);

  await expect(page.locator(".react-flow__node-component")).toHaveCount(1);
  await expect(page.locator(".react-flow__node-component .sa-node__name")).toHaveText("Bravo");
  const restored = page.locator(".react-flow__node-component").first();
  expect(await transformOf(restored)).toBe(moved);
});

test("a renamed component is named in the compact desktop Undo toast", async ({ page }) => {
  await openLibrary(page);
  await createArchitecture(page, "Desktop Undo Toast");
  const node = await addComponent(page, "Agent", "Draft agent");
  const currentName = "Current desktop agent";
  await renameComponent(page, node, currentName);

  await deleteViaToolbar(page, node);
  const toast = page.locator(".sa-toast");
  const message = toast.locator(".sa-toast__message");
  const undo = toast.getByRole("button", { name: "Undo", exact: true });
  await expect(message).toHaveText(`Deleted ${currentName}.`);
  await expect(undo).toBeVisible();

  const metrics = await expectCompactToast(page, 480);
  expect(metrics.toastWidth).toBeLessThan(480);
  await expect(undo).toHaveClass(/sa-button--primary/);
  await page.screenshot({ path: "test-results/undo-toast-desktop.png" });

  await undo.click();
  await expect(toast).toHaveCount(0);
  await expect(page.locator(".react-flow__node-component .sa-node__name")).toHaveText(currentName);
});

test("a long renamed component wraps in the Undo toast at 320px without horizontal overflow", async ({ page }) => {
  await openLibrary(page);
  await createArchitecture(page, "Narrow Undo Toast");
  const node = await addComponent(page, "Agent", "Draft narrow agent");
  const currentName = "RenamedComponentNameWithoutAnySpacesThatMustWrapAtA320PixelViewportForTheUndoToast";
  await renameComponent(page, node, currentName);

  await deleteViaToolbar(page, node);
  const toast = page.locator(".sa-toast");
  const message = toast.locator(".sa-toast__message");
  const undo = toast.getByRole("button", { name: "Undo", exact: true });
  await expect(message).toHaveText(`Deleted ${currentName}.`);
  await expect(undo).toBeVisible();

  await page.setViewportSize({ width: 320, height: 720 });
  await expect(toast).toBeVisible();
  const metrics = await expectCompactToast(page, 288);
  expect(metrics.viewportWidth).toBe(320);
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.toastLeft).toBeGreaterThanOrEqual(0);
  expect(metrics.toastRight).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.messageOverflowWrap).toBe("anywhere");
  expect(metrics.messageHeight).toBeGreaterThan(metrics.messageLineHeight);
  expect(metrics.messageScrollWidth).toBeLessThanOrEqual(metrics.messageClientWidth + 1);
  expect(metrics.undoRight).toBeLessThanOrEqual(metrics.viewportWidth);
  await expect(undo).toBeVisible();
  await page.screenshot({ path: "test-results/undo-toast-320px.png" });

  await undo.click();
  await expect(toast).toHaveCount(0);
  await expect(page.locator(".react-flow__node-component .sa-node__name")).toHaveText(currentName);
});
