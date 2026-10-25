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

for (const path of ["/", "/app/"]) {
  test(`${path} links SVG, ICO and touch icons that are served`, async ({ page, request }) => {
    await page.goto(path);
    const svgIcon = page.locator('head link[rel="icon"][type="image/svg+xml"]');
    await expect(svgIcon).toHaveAttribute("href", "/favicon.svg");
    await expect(page.locator('head link[rel="icon"][href="/favicon.ico"]')).toHaveCount(1);
    await expect(page.locator('head link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/apple-touch-icon.png");

    const svg = await request.get("/favicon.svg");
    expect(svg.ok()).toBe(true);
    expect(await svg.text()).toContain("<svg");
    for (const asset of ["/favicon.ico", "/apple-touch-icon.png"]) {
      expect((await request.get(asset)).ok()).toBe(true);
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
