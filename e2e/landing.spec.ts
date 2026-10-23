import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";
import { openLibrary } from "./helpers";

test("landing page at / links to the editor @smoke", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Document AI-agent architectures, visually." }),
  ).toBeVisible();
  await expect(page.getByRole("banner").getByRole("link", { name: "Swarm Architecturer home" })).toBeVisible();
  const startLinks = page.getByRole("link", { name: "Start", exact: true });
  await expect(startLinks.first()).toHaveAttribute("href", "/app/");
  for (const href of await startLinks.evaluateAll((links) => links.map((link) => link.getAttribute("href")))) {
    expect(href).toBe("/app/");
  }
});

test("landing page links an SVG favicon that is served", async ({ page, request }) => {
  await page.goto("/");
  const icon = page.locator('head link[rel="icon"]');
  await expect(icon).toHaveCount(1);
  await expect(icon).toHaveAttribute("type", "image/svg+xml");
  const href = await icon.getAttribute("href");
  expect(href).toBe("/favicon.svg");
  const response = await request.get(href!);
  expect(response.ok()).toBe(true);
  expect(await response.text()).toContain("<svg");
});

test("landing page has no WCAG A/AA violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectNoA11yViolations(page);
});

test("landing page fits a 320 px viewport without horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.getByRole("link", { name: "Start", exact: true }).first()).toBeVisible();
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
