import { mkdir } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";
import { buildV2File, openImported, openLibrary } from "./helpers";

// "Abeja Bit" brand adoption: placements, crisp pixel rendering, forced colors, reduced
// motion and favicon contrast. Screenshots for human review land in test-results/brand/.
const SHOTS = "test-results/brand";

test.beforeAll(async () => {
  await mkdir(SHOTS, { recursive: true });
});

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

/** Distinct opaque colors in an element screenshot: a crisp pixel mark has only its inks and the backdrop. */
async function distinctColors(page: Page, locator: Locator): Promise<number> {
  const png = await locator.screenshot();
  return page.evaluate(async (bytes) => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set<string>();
    for (let i = 0; i < data.length; i += 4) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    return colors.size;
  }, [...png]);
}

async function box(locator: Locator): Promise<{ width: number; height: number }> {
  const rect = (await locator.boundingBox())!;
  return { width: rect.width, height: rect.height };
}

const sample = buildV2File(
  "Brand review",
  [
    { id: "cmp_o", type: "agent", subtype: "orchestrator", name: "Research Lead", x: 360, y: 40 },
    { id: "cmp_a", type: "agent", name: "Source Scout", x: 160, y: 260 },
    { id: "cmp_t", type: "tool", name: "Web Search", x: 160, y: 460 },
    { id: "cmp_m", type: "memory", name: "Evidence Log", x: 620, y: 260 },
    { id: "cmp_x", type: "external_system", name: "Issue Tracker", x: 620, y: 460 },
    { id: "cmp_d", type: "decision", name: "Route by Topic", x: 400, y: 640 },
  ],
  [
    { id: "rel_1", type: "delegates_to", sourceId: "cmp_o", targetId: "cmp_a", direction: "directed" },
    { id: "rel_2", type: "uses", sourceId: "cmp_a", targetId: "cmp_t", direction: "directed" },
    { id: "rel_3", type: "writes_to", sourceId: "cmp_a", targetId: "cmp_m", direction: "directed" },
  ],
);

test.describe("landing", () => {
  test("shows the pixel bee at whole multiples with no page errors", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const errors = collectErrors(page);
    await page.goto("/");
    await expect(page.locator("#lp-logo")).toHaveAttribute("viewBox", "0 0 16 16");

    const topMark = page.locator(".lp-topbar .lp-brand__mark");
    expect(await box(topMark)).toEqual({ width: 32, height: 32 });
    expect(await distinctColors(page, topMark)).toBeLessThanOrEqual(5);
    expect(await box(page.locator(".lp-final__mark"))).toEqual({ width: 64, height: 64 });
    expect(await box(page.locator(".lp-footer .lp-brand__mark"))).toEqual({ width: 16, height: 16 });

    await page.screenshot({ path: `${SHOTS}/landing-desktop-top.png` });
    await page.locator(".lp-final").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/landing-desktop-final.png` });
    await page.screenshot({ path: `${SHOTS}/landing-desktop-full.png`, fullPage: true });
    expect(errors).toEqual([]);
  });

  test("fits a phone viewport and stays accessible", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.locator(".lp-topbar .lp-brand__mark")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/landing-mobile-320.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${SHOTS}/landing-mobile-390-top.png` });
    await expectNoA11yViolations(page);
  });

  test("uses the one-ink mark in forced colors", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "forced-colors emulation is Chromium-only");
    await page.emulateMedia({ forcedColors: "active" });
    await page.goto("/");
    const mark = page.locator(".lp-topbar .lp-brand__mark");
    const stripeFill = await mark.evaluate((svg) => {
      const use = svg.querySelector("use")!;
      return getComputedStyle(use).getPropertyValue("--lp-logo-stripe").trim();
    });
    expect(stripeFill).toBe("Canvas");
    await expect(page.locator(".lp-panel").first()).toHaveCSS("box-shadow", "none");
    await page.screenshot({ path: `${SHOTS}/landing-forced-colors.png` });
    await page.locator(".lp-final").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/landing-forced-colors-final.png` });
  });

  test("keeps the call to action still under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const cta = page.locator(".lp-hero .sa-button--primary.lp-button--lg");
    await cta.hover();
    await expect(cta).toHaveCSS("transform", "none");
    // Only the color responds: the accent hover, no lift.
    await expect(cta).toHaveCSS("background-color", "rgb(30, 65, 166)");
  });
});

test.describe("app", () => {
  test("library shows the 32 px lockup above the unchanged title", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const errors = collectErrors(page);
    await openLibrary(page);
    const lockup = page.locator(".sa-library__brand");
    await expect(lockup).toHaveText("Swarm Architecturer");
    await expect(lockup.getByRole("link")).toHaveCount(0);
    const mark = lockup.locator("svg");
    expect(await box(mark)).toEqual({ width: 32, height: 32 });
    expect(await distinctColors(page, mark)).toBeLessThanOrEqual(5);
    await expect(page.getByRole("heading", { level: 1, name: "Architectures" })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/library-empty-1280.png` });
    await page.setViewportSize({ width: 375, height: 720 });
    await page.screenshot({ path: `${SHOTS}/library-empty-375.png` });
    expect(errors).toEqual([]);
  });

  test("editor toolbar carries the 16 px mark without changing focus order", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const errors = collectErrors(page);
    await openImported(page, "Brand review", sample);
    const mark = page.locator(".sa-toolbar__mark");
    await expect(mark).toBeVisible();
    expect(await box(mark)).toEqual({ width: 16, height: 16 });
    expect(await distinctColors(page, mark)).toBeLessThanOrEqual(5);
    await expect(mark).toHaveAttribute("aria-hidden", "true");
    await expect(page.getByRole("button", { name: "Library", exact: true })).toBeVisible();
    // The mark is not focusable: the toolbar's first tab stop is still the Library button.
    const firstStop = await page.locator(".sa-toolbar").evaluate((toolbar) => {
      const focusable = toolbar.querySelector<HTMLElement>("button, input, a[href], [tabindex]:not([tabindex='-1'])");
      return focusable?.textContent?.trim();
    });
    expect(firstStop).toBe("Library");
    await page.getByRole("button", { name: "Fit to content" }).click();
    await page.screenshot({ path: `${SHOTS}/editor-populated-1440.png` });

    await page.locator(".react-flow__node-component").first().click();
    await page.screenshot({ path: `${SHOTS}/editor-selected-1440.png` });

    await page.setViewportSize({ width: 1000, height: 800 });
    await expect(mark).toBeHidden();
    await page.screenshot({ path: `${SHOTS}/editor-populated-1000.png` });
    expect(errors).toEqual([]);
  });

  test("library with rows and forced colors", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "forced-colors emulation is Chromium-only");
    await page.setViewportSize({ width: 1280, height: 800 });
    await openImported(page, "Brand review", sample);
    await page.getByRole("button", { name: "Library", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Architectures" })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/library-rows-1280.png` });
    await page.getByRole("button", { name: "New architecture" }).click();
    // Keyboard focus on the blue primary: the ring must stay visible around it.
    await page.getByRole("dialog", { name: "New architecture" }).getByRole("button", { name: "Cancel" }).focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Create" })).toBeFocused();
    await page.screenshot({ path: `${SHOTS}/dialog-create-focus.png` });
    await page.keyboard.press("Escape");

    await page.emulateMedia({ forcedColors: "active" });
    const stripe = page.locator(".sa-library__brand .sa-brand-mark__stripe");
    const [stripeFill, background] = await stripe.evaluate((path) => [
      getComputedStyle(path).fill,
      getComputedStyle(document.querySelector(".sa-library")!).backgroundColor,
    ]);
    expect(stripeFill).toBe(background);
    await page.screenshot({ path: `${SHOTS}/library-forced-colors.png` });
  });
});

for (const scheme of ["light", "dark"] as const) {
  test(`favicon specimen in a ${scheme} browser theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");
    const tab = scheme === "dark" ? "#35363A" : "#DEE1E6";
    // Thorax cell (9, 9) belongs to the body layer, which turns cream in dark themes; abdomen
    // cell (1, 9) is the blue abdomen, one step lighter in dark themes.
    const [thorax, abdomen] = await page.evaluate(async () => {
      const image = new Image();
      image.src = "/favicon.svg";
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 16;
      canvas.height = 16;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0, 16, 16);
      return [9, 1].map((x) => [...context.getImageData(x, 9, 1, 1).data].slice(0, 3));
    });
    expect(thorax).toEqual(scheme === "dark" ? [243, 235, 221] : [31, 29, 26]);
    expect(abdomen).toEqual(scheme === "dark" ? [91, 132, 230] : [59, 102, 217]);

    await page.setContent(`<!doctype html><body style="margin:0;padding:16px;display:grid;gap:12px;background:${tab};font:13px system-ui;color:${scheme === "dark" ? "#E8EAED" : "#202124"}">
      <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px 8px 0 0;background:${scheme === "dark" ? "#202124" : "#FFFFFF"};width:240px"><img src="http://127.0.0.1:4173/favicon.svg" width="16" height="16" alt="">Swarm Architecturer</div>
      <div style="display:flex;align-items:end;gap:16px">
        <img src="http://127.0.0.1:4173/favicon.svg" width="16" height="16" alt="">
        <img src="http://127.0.0.1:4173/favicon.svg" width="32" height="32" alt="">
        <img src="http://127.0.0.1:4173/favicon.svg" width="64" height="64" alt="">
        <img src="http://127.0.0.1:4173/favicon.ico" width="32" height="32" alt="">
        <img src="http://127.0.0.1:4173/apple-touch-icon.png" width="180" height="180" alt="">
      </div></body>`);
    await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0));
    await page.screenshot({ path: `${SHOTS}/favicon-${scheme}.png` });
  });
}
