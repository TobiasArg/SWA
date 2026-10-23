import { expect, test } from "@playwright/test";
import {
  addComponent,
  componentNodeByName,
  createArchitecture,
  modifierFor,
  moveComponentBy,
} from "./helpers";

test("keyboard walkthrough — tab order, focus ring, Connect, Escape and history", async ({ page }) => {
  await page.goto("/#/");
  await createArchitecture(page, "Keyboard walkthrough");
  await addComponent(page, "Agent", "Keyboard Source");
  await addComponent(page, "Tool", "Keyboard Target");
  await moveComponentBy(page, "Keyboard Target", 0, 200);

  await page.getByRole("button", { name: "Library", exact: true }).focus();
  const areas: string[] = ["toolbar"];
  await page.keyboard.press("Tab");
  for (let index = 0; index < 70 && !areas.includes("inspector"); index += 1) {
    const area = await page.evaluate(() => {
      const active = document.activeElement;
      if (!(active instanceof Element)) return null;
      if (active.closest(".sa-toolbar")) return "toolbar";
      if (active.closest(".sa-editor__palette")) return "palette";
      if (active.closest("[data-sa-canvas]")) return "canvas";
      if (active.closest(".sa-editor__inspector-dock")) return "inspector";
      return null;
    });
    if (area && areas.at(-1) !== area) areas.push(area);
    if (area === "inspector") break;
    await page.keyboard.press("Tab");
  }
  expect(areas.slice(0, 4)).toEqual(["toolbar", "palette", "canvas", "inspector"]);

  const source = await componentNodeByName(page, "Keyboard Source");
  await source.focus();
  await page.keyboard.press("Enter");
  const ring = await source.evaluate((element) => {
    const style = getComputedStyle(element);
    return { color: style.outlineColor, width: style.outlineWidth, style: style.outlineStyle };
  });
  expect(ring).toEqual({ color: "rgb(31, 29, 26)", width: "2px", style: "solid" });

  await page.keyboard.press("c");
  const dialog = page.getByRole("dialog", { name: "Connect" });
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel("Relationship type", { exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(source).toBeFocused();

  const connectButton = page
    .getByRole("region", { name: "Inspector" })
    .getByRole("button", { name: "Connect…", exact: true });
  await connectButton.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(connectButton).toBeFocused();

  await source.press("Enter");
  await expect(source).toHaveClass(/selected/);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.locator(".sa-toolbar").getByRole("button", { name: "Connect…", exact: true }).click();
  await expect(dialog).toBeVisible();
  await page.getByLabel("Target component", { exact: true }).selectOption({ label: "Keyboard Target" });
  await page.getByRole("dialog", { name: "Connect" }).getByRole("button", { name: "Connect", exact: true }).click();
  const relationship = page.locator(".react-flow__edge").first();
  await expect(relationship).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(relationship).not.toHaveClass(/selected/);

  // Every delete asks first in the app-styled dialog; Cancel is focused and Escape cancels.
  await source.press("Enter");
  await page.keyboard.press("Delete");
  const confirm = page.getByRole("dialog", { name: "Delete 1 component and 1 relationship?" });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(confirm).toBeHidden();
  await expect(source).toBeVisible();
  await expect(source).toBeFocused();
  await expect(source).toHaveClass(/selected/);

  await page.keyboard.press("Backspace");
  await expect(confirm).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(confirm.getByRole("button", { name: "Delete", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(confirm).toBeHidden();
  await expect(source).toHaveCount(0);
  const toast = page.locator(".sa-toast");
  await expect(toast).toContainText("Deleted Keyboard Source and 1 relationship.");
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest("[data-sa-canvas]")))).toBe(true);

  const toastUndo = toast.getByRole("button", { name: "Undo", exact: true });
  for (let index = 0; index < 40; index += 1) {
    if (await toastUndo.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  await expect(toastUndo).toBeFocused();
  await page.keyboard.press("Enter");
  const restored = await componentNodeByName(page, "Keyboard Source");
  await expect(restored).toBeVisible();
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);

  const modifier = await modifierFor(page);
  await restored.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Delete");
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(restored).toHaveCount(0);
  await page.keyboard.down(modifier);
  await page.keyboard.press("z");
  await page.keyboard.up(modifier);
  await expect(restored).toBeVisible();
  await page.keyboard.down(modifier);
  await page.keyboard.press("Shift+z");
  await page.keyboard.up(modifier);
  await expect(restored).toHaveCount(0);
});
