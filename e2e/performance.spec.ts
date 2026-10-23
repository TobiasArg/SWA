import { expect, test } from "@playwright/test";
import { performanceFixture } from "./fixtures/performanceFixture";
import { componentNodeByName, importJson } from "./helpers";

test("performance — selection under 100 ms, group drag frames ≤ 32 ms, zoom and pan respond", async ({ page }) => {
  await page.goto("/app/#/");
  await page.getByRole("button", { name: "Import JSON" }).click();
  await importJson(page, "performance-fixture.json", JSON.stringify(performanceFixture));
  await expect(page.getByRole("textbox", { name: "Architecture name" })).toHaveValue(
    "Performance Fixture — 100 Components",
  );
  await expect(page.locator(".react-flow__node-component")).toHaveCount(100);
  await expect(page.locator(".react-flow__edge")).toHaveCount(150);
  await expect(page.locator(".react-flow__node-group-container")).toHaveCount(10);

  const target = await componentNodeByName(page, "Load Test Agent 001");
  await page.evaluate((name) => {
    const state = { startedAt: null as number | null, elapsed: null as number | null };
    (window as Window & { __selectionPerf?: typeof state }).__selectionPerf = state;
    const observer = new MutationObserver(() => {
      if (
        state.startedAt !== null &&
        document.querySelector(".sa-inspector__title")?.textContent === name
      ) {
        state.elapsed = performance.now() - state.startedAt;
        observer.disconnect();
      }
    });
    const inspector = document.querySelector(".sa-editor__inspector");
    if (inspector) observer.observe(inspector, { childList: true, subtree: true, characterData: true });
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (event.target instanceof Element && event.target.closest(".react-flow__node-component")?.querySelector(".sa-node__name")?.textContent === name) {
          state.startedAt = performance.now();
        }
      },
      { once: true },
    );
  }, "Load Test Agent 001");
  await target.click({ force: true });
  await expect(page.locator(".sa-inspector__title")).toHaveText("Load Test Agent 001");
  await expect
    .poll(() => page.evaluate(() => (window as Window & { __selectionPerf?: { elapsed: number | null } }).__selectionPerf?.elapsed ?? null))
    .not.toBeNull();
  const selectionTime = await page.evaluate(
    () => (window as Window & { __selectionPerf?: { elapsed: number | null } }).__selectionPerf?.elapsed ?? Number.POSITIVE_INFINITY,
  );
  expect(selectionTime).toBeLessThan(100);

  const group = page.locator('.react-flow__node[data-id="perf-grp-1"]');
  const header = group.locator(".sa-group__header");
  const headerBox = await header.boundingBox();
  expect(headerBox).not.toBeNull();
  await page.evaluate(() => {
    const perfWindow = window as Window & { __framePerf?: { active: boolean; frames: number[]; previous: number | null } };
    const state = { active: true, frames: [] as number[], previous: null as number | null };
    perfWindow.__framePerf = state;
    const tick = (now: number) => {
      if (!state.active) return;
      if (state.previous !== null) state.frames.push(now - state.previous);
      state.previous = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const startX = headerBox!.x + Math.min(100, headerBox!.width / 2);
  const startY = headerBox!.y + headerBox!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.waitForTimeout(100);
  await page.mouse.move(startX + 80, startY + 48, { steps: 8 });
  await page.waitForTimeout(100);
  await page.mouse.up();
  const frames = await page.evaluate(() => {
    const state = (window as Window & { __framePerf?: { active: boolean; frames: number[] } }).__framePerf;
    if (!state) return [];
    state.active = false;
    return state.frames;
  });
  expect(frames.length).toBeGreaterThan(0);
  const sortedFrames = [...frames].sort((a, b) => a - b);
  const medianFrame = sortedFrames[Math.floor(sortedFrames.length / 2)]!;
  expect(medianFrame).toBeLessThanOrEqual(32);

  const viewport = page.locator(".react-flow__viewport");
  const beforeZoom = await viewport.getAttribute("style");
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect.poll(() => viewport.getAttribute("style")).not.toBe(beforeZoom);

  const panPoint = await page.evaluate(() => {
    const pane = document.querySelector<HTMLElement>(".react-flow__pane");
    const bounds = pane?.getBoundingClientRect();
    if (!pane || !bounds) return null;
    for (let y = bounds.top + 80; y < bounds.bottom - 80; y += 20) {
      for (let x = bounds.right - 160; x > bounds.left + 160; x -= 20) {
        const target = document.elementFromPoint(x, y);
        if (target === pane) return { x, y };
      }
    }
    return null;
  });
  expect(panPoint, "the React Flow pane should expose an empty pan target").not.toBeNull();
  const beforePan = await viewport.getAttribute("style");
  const panX = panPoint!.x;
  const panY = panPoint!.y;
  await page.mouse.move(panX, panY);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.move(panX + 36, panY + 24, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => viewport.getAttribute("style")).not.toBe(beforePan);
});
