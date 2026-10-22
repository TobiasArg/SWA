import { expect, test } from "@playwright/test";
import {
  addComponent,
  componentNodeByName,
  connectViaDialog,
  createArchitecture,
  downloadBuffer,
  importJson,
  modifierFor,
  moveComponentBy,
  openLibrary,
  pngDimensions,
  waitForSaved,
} from "./helpers";
import { expectNoA11yViolations } from "./axe";

test("library create, rename, reload persistence and native dialog @smoke", { tag: "@smoke" }, async ({ page }) => {
  await openLibrary(page);
  await expectNoA11yViolations(page);
  await createArchitecture(page, "Wave one smoke library");
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(page.getByRole("link", { name: "Wave one smoke library" })).toBeVisible();

  await page.getByRole("button", { name: "Rename Wave one smoke library" }).click();
  const renameDialog = page.getByRole("dialog", { name: "Rename architecture" });
  await expect(renameDialog).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("Wave one smoke renamed");
  await renameDialog.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(page.getByRole("link", { name: "Wave one smoke renamed" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("link", { name: "Wave one smoke renamed" })).toBeVisible();
});

test("editor pointer drag, Connect dialog, keyboard history and reload persistence @smoke", { tag: "@smoke" }, async ({ page }) => {
  await openLibrary(page);
  await createArchitecture(page, "Wave one smoke editor");
  await addComponent(page, "Agent", "Smoke source");
  await expectNoA11yViolations(page);
  await addComponent(page, "Tool", "Smoke target");
  await moveComponentBy(page, "Smoke target", 240, 180);
  await addComponent(page, "Memory / Data Store", "Smoke store");
  await connectViaDialog(page, "Smoke source", "Smoke target", "Generic");
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);

  const modifier = await modifierFor(page);
  await page.keyboard.down(modifier);
  await page.keyboard.press("z");
  await page.keyboard.up(modifier);
  await expect(page.locator(".react-flow__edge")).toHaveCount(0);
  await page.keyboard.down(modifier);
  await page.keyboard.press("Shift+z");
  await page.keyboard.up(modifier);
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);

  await waitForSaved(page);
  await page.reload();
  await expect(page.locator(".react-flow__node-component")).toHaveCount(3);
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  const restoredTarget = await componentNodeByName(page, "Smoke target");
  await expect(restoredTarget).toBeVisible();
});

test("delete confirmation cancels and confirmed deletion is restored by its toast @smoke", { tag: "@smoke" }, async ({ page }) => {
  await openLibrary(page);
  await createArchitecture(page, "Wave one smoke delete");
  await addComponent(page, "Agent", "Smoke undo component");
  const component = await componentNodeByName(page, "Smoke undo component");
  await component.focus();
  await page.keyboard.press("Enter");

  const toolbarDelete = page.locator(".sa-toolbar").getByRole("button", { name: "Delete", exact: true });
  await toolbarDelete.click();
  let dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(component).toBeVisible();

  await toolbarDelete.click();
  dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(component).toHaveCount(0);
  const toast = page.locator(".sa-toast");
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(component).toBeVisible();
});

test("JSON download, FileReader import, PNG signature and dimensions, and editor CSP @smoke", { tag: "@smoke" }, async ({ page }) => {
  await page.addInitScript(() => {
    const browserWindow = window as Window & { __saCspViolations?: string[] };
    browserWindow.__saCspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      browserWindow.__saCspViolations?.push(
        `${event.violatedDirective}: ${event.blockedURI || "inline"} at ${event.sourceFile}:${event.lineNumber}:${event.columnNumber}`,
      );
    });
  });

  await openLibrary(page);
  await createArchitecture(page, "Wave one smoke exports");
  await addComponent(page, "Agent", "Exported smoke component");
  await waitForSaved(page);

  const jsonDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  await page.getByRole("menuitem", { name: "JSON file" }).click();
  const jsonBuffer = await downloadBuffer(await jsonDownload);
  const exported = JSON.parse(jsonBuffer.toString("utf8")) as {
    architecture: { name: string; components: unknown[] };
  };
  expect(exported.architecture.name).toBe("Wave one smoke exports");
  expect(exported.architecture.components).toHaveLength(1);

  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: "Import JSON" }).click();
  await importJson(page, "wave-one-smoke.json", jsonBuffer);
  await expect(page.getByRole("textbox", { name: "Architecture name" })).toHaveValue(
    "Wave one smoke exports (imported)",
  );

  const pngDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  await page.getByRole("menuitem", { name: "PNG image" }).click();
  const png = await downloadBuffer(await pngDownload);
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const { width, height } = await pngDimensions(png);
  expect(width).toBeGreaterThan(0);
  expect(height).toBeGreaterThan(0);
  const cspViolations = await page.evaluate(
    () => (window as Window & { __saCspViolations?: string[] }).__saCspViolations ?? [],
  );
  expect(cspViolations, "editor route should not generate securitypolicyviolation events").toEqual([]);
});

test("BroadcastChannel refreshes an already-open library in another tab @smoke", { tag: "@smoke" }, async ({ page }) => {
  await openLibrary(page);
  await createArchitecture(page, "Wave one broadcast before");
  await page.getByRole("button", { name: "Library", exact: true }).click();

  const otherTab = await page.context().newPage();
  await openLibrary(otherTab);
  await expect(otherTab.getByRole("link", { name: "Wave one broadcast before" })).toBeVisible();

  await page.getByRole("button", { name: "Rename Wave one broadcast before" }).click();
  const dialog = page.getByRole("dialog", { name: "Rename architecture" });
  await page.getByLabel("Name", { exact: true }).fill("Wave one broadcast after");
  await dialog.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(otherTab.getByRole("link", { name: "Wave one broadcast after" })).toBeVisible();
  await otherTab.close();
});
