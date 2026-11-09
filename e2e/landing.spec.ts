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

// Browsers keep favicons in a separate cache keyed by icon URL and do not refetch them on reload,
// so a new mark only shows if the href changes. Bump ICON_VERSION whenever the icon artwork changes.
const ICON_VERSION = "blue-bee-2";
const SVG_ICON = `/favicon.svg?v=${ICON_VERSION}`;
const ICO_ICON = `/favicon.ico?v=${ICON_VERSION}`;
const TOUCH_ICON = `/apple-touch-icon.png?v=${ICON_VERSION}`;

for (const path of ["/", "/app/"]) {
  test(`${path} links versioned SVG, ICO and touch icons that are served`, async ({ page, request }) => {
    await page.goto(path);
    const svgIcon = page.locator('head link[rel="icon"][type="image/svg+xml"]');
    await expect(svgIcon).toHaveCount(1);
    await expect(svgIcon).toHaveAttribute("href", SVG_ICON);
    await expect(svgIcon).toHaveAttribute("sizes", "any");
    await expect(page.locator('head link[rel="icon"]')).toHaveCount(2);
    await expect(page.locator(`head link[rel="icon"][href="${ICO_ICON}"]`)).toHaveCount(1);
    await expect(page.locator('head link[rel="apple-touch-icon"]')).toHaveAttribute("href", TOUCH_ICON);

    const svg = await request.get(SVG_ICON);
    expect(svg.ok()).toBe(true);
    expect(svg.headers()["content-type"]).toContain("image/svg+xml");
    const body = await svg.text();
    expect(body).toContain("<svg");
    // The blue pixel bee abdomen, not the retired Flock S mark.
    expect(body).toContain("#3B66D9");
    for (const [asset, type] of [
      [ICO_ICON, "icon"],
      [TOUCH_ICON, "image/png"],
    ]) {
      const response = await request.get(asset);
      expect(response.ok()).toBe(true);
      expect(response.headers()["content-type"]).toContain(type);
    }
  });
}

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
