import { expect, test } from "@playwright/test";
import { openLibrary } from "./helpers";

test("landing page at / links to the editor @smoke", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Swarm Architecturer" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Start" }).first()).toHaveAttribute("href", "/app/");
});

test("legacy root hash routes redirect into the editor @smoke", async ({ page }) => {
  await page.goto("/#/a/some-id");
  await page.waitForURL("**/app/#/a/some-id");
  expect(new URL(page.url()).pathname).toBe("/app/");
  expect(new URL(page.url()).hash).toBe("#/a/some-id");
});

test("editor app at /app/ shows the library @smoke", async ({ page }) => {
  await openLibrary(page);
  expect(new URL(page.url()).pathname).toBe("/app/");
});
