import { expect, test } from "@playwright/test";
import { addComponent, createArchitecture, waitForSaved } from "./helpers";

test("Scenario F — restore local content and viewport in a fresh browser context", async ({ page, browser }) => {
  await page.goto("/app/#/");
  await createArchitecture(page, "Scenario F — Local restore");
  await addComponent(page, "Agent", "Persistent Agent");
  await addComponent(page, "Tool", "Persistent Tool");
  await page.getByRole("button", { name: "Zoom in" }).click();
  await waitForSaved(page);

  const savedViewport = await page.locator(".react-flow__viewport").getAttribute("style");
  expect(savedViewport).toContain("transform");
  const route = new URL(page.url()).hash;
  const storageState = await page.context().storageState({ indexedDB: true });
  const freshContext = await browser.newContext({ storageState });

  try {
    const restoredPage = await freshContext.newPage();
    await restoredPage.goto(`/app/${route}`);
    await expect(restoredPage.getByRole("textbox", { name: "Architecture name" })).toHaveValue(
      "Scenario F — Local restore",
    );
    await expect(restoredPage.locator(".sa-node__name", { hasText: "Persistent Agent" })).toBeVisible();
    await expect(restoredPage.locator(".sa-node__name", { hasText: "Persistent Tool" })).toBeVisible();
    await expect
      .poll(() => restoredPage.locator(".react-flow__viewport").getAttribute("style"))
      .toBe(savedViewport);
  } finally {
    await freshContext.close();
  }
});
