import { expect, test, type Page } from "@playwright/test";
import { performanceFixture } from "./fixtures/performanceFixture";
import { componentNodeByName, importJson, modifierFor, openLibrary } from "./helpers";

// ROADMAP_V2_DESIGN §3 (QF5): Quick Find selects, focuses and zooms to a component.

async function openPerformanceFixture(page: Page): Promise<void> {
  await openLibrary(page);
  await page.getByRole("button", { name: "Import JSON" }).click();
  await importJson(page, "performance-fixture.json", JSON.stringify(performanceFixture));
  await expect(page.getByRole("textbox", { name: "Architecture name" })).toHaveValue(
    "Performance Fixture — 100 Components",
  );
  await expect(page.locator(".react-flow__node-component")).toHaveCount(100);
}

async function zoomLevel(page: Page): Promise<number> {
  return page.locator(".react-flow__viewport").evaluate((element) => {
    const match = /scale\(([^)]+)\)/.exec((element as HTMLElement).style.transform);
    return match ? Number(match[1]) : Number.NaN;
  });
}

test("Mod+K finds a component in a zoomed-out diagram: selected, focused, revealed at zoom ≥ 1", async ({ page }) => {
  await openPerformanceFixture(page);
  const zoomOut = page.locator(".sa-toolbar").getByRole("button", { name: "Zoom out", exact: true });
  for (let step = 0; step < 4; step += 1) await zoomOut.click();
  await expect.poll(() => zoomLevel(page)).toBeLessThan(1);

  await page.locator("[data-sa-canvas]").focus();
  // The app picks Mod from the page's platform (Desktop Chrome reports Windows), not the host OS.
  await page.keyboard.press(`${await modifierFor(page)}+k`);
  const dialog = page.getByRole("dialog", { name: "Find component" });
  await expect(dialog).toBeVisible();
  const combobox = dialog.getByRole("combobox", { name: "Component name" });
  await expect(combobox).toBeFocused();
  await expect(dialog.getByRole("status")).toHaveText("Showing 50 of 100. Keep typing to narrow the list.");

  await combobox.fill("agent 087");
  await expect(dialog.getByRole("option")).toHaveCount(1);
  await expect(dialog.getByRole("status")).toHaveText("1 result");
  await expect(combobox).toHaveAttribute("aria-activedescendant", /.+/);
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();

  const target = await componentNodeByName(page, "Load Test Agent 087");
  await expect(page.locator(".sa-inspector__title")).toHaveText("Load Test Agent 087");
  await expect(target).toBeFocused();
  await expect(target).toHaveClass(/selected/);
  await expect.poll(() => zoomLevel(page)).toBeGreaterThanOrEqual(1);
  await expect(target).toBeInViewport({ ratio: 1 });
  await expect(page.locator(".sa-live-region")).toHaveText("Selected Load Test Agent 087.");

  // Delete acts on the found component right away.
  await page.keyboard.press("Delete");
  const confirm = page.getByRole("dialog", { name: /^Delete 1 component/ });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(target).toBeFocused();
});

test("/ opens Quick Find outside text fields, Mod+K inside them; Escape returns focus without changes", async ({ page }) => {
  await openPerformanceFixture(page);
  const dialog = page.getByRole("dialog", { name: "Find component" });
  const name = page.getByRole("textbox", { name: "Architecture name" });

  // "/" types into a text field instead of opening Quick Find.
  await name.focus();
  await page.keyboard.press("End");
  await page.keyboard.press("/");
  await expect(dialog).toBeHidden();
  await expect(name).toHaveValue("Performance Fixture — 100 Components/");
  await page.keyboard.press("Escape");
  await expect(name).toHaveValue("Performance Fixture — 100 Components");

  // Mod+K is not trapped by the field.
  await name.focus();
  await page.keyboard.press(`${await modifierFor(page)}+k`);
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  const canvas = page.locator("[data-sa-canvas]");
  await canvas.focus();
  await page.keyboard.press("/");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox").fill("zzz no match");
  await expect(dialog.getByRole("status")).toHaveText('No components match "zzz no match"');
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(canvas).toBeFocused();
  await expect(page.locator(".react-flow__node-component.selected")).toHaveCount(0);

  // The toolbar button is the pointer path; focus returns to it.
  const find = page.locator(".sa-toolbar").getByRole("button", { name: "Find component", exact: true });
  await find.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(find).toBeFocused();
});
