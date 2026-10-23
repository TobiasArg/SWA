import { expect, test, type Locator, type Page } from "@playwright/test";
import { buildV2File, exportJsonFile, nodeById, openImported, waitForSaved } from "./helpers";

// ROADMAP_V2_DESIGN §5 (AR7): Arrange changes positions only, and Tidy has an entry-bound Undo toast.

test.use({ viewport: { width: 1600, height: 1000 } });

const A = { id: "cmp_a", type: "agent", name: "Alpha Agent", x: 40, y: 100 } as const;
const B = { id: "cmp_b", type: "tool", name: "Beta Tool", x: 330, y: 300 } as const;
const C = { id: "cmp_c", type: "memory", name: "Gamma Store", x: 700, y: 180 } as const;
const RELATIONSHIPS = [
  { id: "rel_ab", type: "uses", sourceId: A.id, targetId: B.id, direction: "directed" as const, visual: { ports: { source: "right", target: "left" } } },
  { id: "rel_cb", type: "generic", sourceId: C.id, targetId: B.id, direction: "undirected" as const },
];

const nodes = (page: Page): Locator[] => [nodeById(page, A.id), nodeById(page, B.id), nodeById(page, C.id)];

async function boxes(page: Page) {
  return Promise.all(
    nodes(page).map(async (node) => {
      const box = await node.boundingBox();
      expect(box, "node should be laid out").not.toBeNull();
      return box!;
    }),
  );
}

const transforms = (page: Page) =>
  Promise.all(nodes(page).map((node) => node.evaluate((element) => (element as HTMLElement).style.transform)));

/** Shift-drags a selection rectangle around every component. */
async function selectAll(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  const all = await boxes(page);
  const left = Math.min(...all.map((box) => box.x)) - 16;
  const top = Math.min(...all.map((box) => box.y)) - 16;
  const right = Math.max(...all.map((box) => box.x + box.width)) + 16;
  const bottom = Math.max(...all.map((box) => box.y + box.height)) + 16;
  await page.keyboard.down("Shift");
  await page.mouse.move(left, top);
  await page.mouse.down();
  await page.mouse.move(right, bottom, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect(page.locator(".react-flow__node-component.selected")).toHaveCount(3);
}

async function arrange(page: Page, item: RegExp): Promise<void> {
  await page.locator(".sa-toolbar").getByRole("button", { name: "Arrange", exact: true }).click();
  await page.getByRole("menuitem", { name: item }).click();
  await expect(page.getByRole("menu", { name: "Arrange" })).toBeHidden();
}

test("Align top and Distribute horizontally move positions only; Tidy is undone by its toast", async ({ page }) => {
  await openImported(page, "Arrange flow", buildV2File("Arrange flow", [A, B, C], RELATIONSHIPS));
  await waitForSaved(page);
  const original = await exportJsonFile(page);

  await selectAll(page);
  await arrange(page, /^Align top/);
  await expect.poll(async () => new Set((await boxes(page)).map((box) => Math.round(box.y))).size).toBe(1);
  await expect(page.locator(".sa-live-region")).toHaveText("Aligned 3 items to the top.");
  await expect(page.locator(".sa-toast")).toHaveCount(0);

  await arrange(page, /^Distribute horizontally/);
  await expect
    .poll(async () => {
      const [a, b, c] = (await boxes(page)).sort((left, right) => left.x - right.x);
      return Math.abs(b!.x - (a!.x + a!.width) - (c!.x - (b!.x + b!.width)));
    })
    .toBeLessThanOrEqual(1);
  await expect(page.locator(".sa-live-region")).toHaveText("Distributed 3 items.");

  await waitForSaved(page);
  const arranged = await exportJsonFile(page);
  expect(JSON.stringify(arranged.parsed.architecture.relationships)).toBe(
    JSON.stringify(original.parsed.architecture.relationships),
  );

  // Tidy with nothing selected covers the whole diagram and offers an Undo bound to its entry.
  await page.locator("[data-sa-canvas]").focus();
  await page.keyboard.press("Escape");
  await expect(page.locator(".react-flow__node-component.selected")).toHaveCount(0);
  const beforeTidy = await transforms(page);
  await arrange(page, /^Tidy layout/);
  const toast = page.locator(".sa-toast");
  await expect(toast).toContainText("Tidied 3 items.");
  await expect.poll(() => transforms(page)).not.toEqual(beforeTidy);
  await waitForSaved(page);
  const tidied = await exportJsonFile(page);
  expect(JSON.stringify(tidied.parsed.architecture.relationships)).toBe(
    JSON.stringify(original.parsed.architecture.relationships),
  );
  expect(tidied.parsed.architecture.components.map((component) => component.id)).toEqual([A.id, B.id, C.id]);

  await toast.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(toast).toHaveCount(0);
  await expect.poll(() => transforms(page)).toEqual(beforeTidy);
  await expect(page.locator(".sa-live-region")).toHaveText("Undid the tidy layout.");
});

test("the Arrange menu is keyboard-operable and disables what the selection can't do", async ({ page }) => {
  await openImported(page, "Arrange keys", buildV2File("Arrange keys", [A, B, C], RELATIONSHIPS));
  await nodeById(page, A.id).focus();
  await page.keyboard.press("Enter");

  const trigger = page.locator(".sa-toolbar").getByRole("button", { name: "Arrange", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "Arrange" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /^Align left/ })).toBeDisabled();
  await expect(menu.getByRole("menuitem", { name: /^Distribute horizontally/ })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
});
