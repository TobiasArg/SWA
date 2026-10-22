import { expect, test } from "@playwright/test";
import { buildV2File, modifierFor, nodeById, openImported, selectTwoComponents, waitForSaved } from "./helpers";

test.use({ viewport: { width: 1600, height: 1000 } });

const A = { id: "cmp_a", type: "agent", name: "Alpha Agent", x: 100, y: 150 } as const;
const B = { id: "cmp_b", type: "tool", name: "Beta Tool", x: 650, y: 150 } as const;

test.describe("Roadmap v2 §4 — color on a multi-selection", () => {
  test("MC4: mixed selection takes one color, undo restores both, the color persists", async ({ page }) => {
    await openImported(page, "Multi color", buildV2File("Multi color", [A, B]));
    const nodeA = nodeById(page, A.id).locator(".sa-node");
    const nodeB = nodeById(page, B.id).locator(".sa-node");
    const color = page.getByRole("group", { name: "Color" });

    // Color the two nodes differently with the single-component picker.
    await nodeById(page, A.id).click();
    await color.locator('label[title="Tomato"]').click();
    await expect(nodeA).toHaveAttribute("data-palette", "tomato");
    await nodeById(page, B.id).click();
    await color.locator('label[title="Mint"]').click();
    await expect(nodeB).toHaveAttribute("data-palette", "mint");

    // Box-select both: the mixed state checks nothing.
    await selectTwoComponents(page, A.name, B.name);
    await expect(color).toBeVisible();
    await expect(page.getByText("Color: Mixed (2 colors)")).toBeVisible();
    await expect(color.getByRole("radio", { checked: true })).toHaveCount(0);
    await expect(color.getByRole("radio", { name: "Tomato, used by 1 of 2" })).toBeAttached();
    await expect(color.getByRole("radio", { name: "Mint, used by 1 of 2" })).toBeAttached();

    await color.locator('label[title="Fern"]').click();
    await expect(nodeA).toHaveAttribute("data-palette", "fern");
    await expect(nodeB).toHaveAttribute("data-palette", "fern");
    await expect(page.getByText("Color: Fern")).toBeVisible();

    // One Mod+Z restores both original palettes (one history entry).
    await page.keyboard.press(`${await modifierFor(page)}+z`);
    await expect(nodeA).toHaveAttribute("data-palette", "tomato");
    await expect(nodeB).toHaveAttribute("data-palette", "mint");
    await expect(page.getByText("Color: Mixed (2 colors)")).toBeVisible();

    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(nodeA).toHaveAttribute("data-palette", "fern");
    await expect(nodeB).toHaveAttribute("data-palette", "fern");
    await waitForSaved(page);

    // Reload: the colors persist.
    await page.reload();
    await expect(nodeById(page, A.id).locator(".sa-node")).toHaveAttribute("data-palette", "fern");
    await expect(nodeById(page, B.id).locator(".sa-node")).toHaveAttribute("data-palette", "fern");
  });
});
