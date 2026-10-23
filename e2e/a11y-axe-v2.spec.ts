import { expect, test, type Page } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";
import { buildV2File, modifierFor, nodeById, openImported, selectTwoComponents } from "./helpers";

// ROADMAP_V2_DESIGN §7.2 wave 3: Quick Find, Arrange, Versions, restore confirmation and the
// mixed multi-color inspector are scanned in the states users reach them in.
// The empty Versions state can't be reached here: every editor session captures its open
// version first (§6.4). VersionsDialog.test.tsx covers it.

test.use({ viewport: { width: 1600, height: 1000 } });

const A = { id: "cmp_a", type: "agent", name: "Alpha Agent", x: 100, y: 150, accent: "tomato" } as const;
const B = { id: "cmp_b", type: "tool", name: "Beta Tool", x: 650, y: 150, accent: "mint" } as const;
const C = { id: "cmp_c", type: "memory", name: "Gamma Store", x: 380, y: 420 } as const;

async function openFixture(page: Page, name: string): Promise<void> {
  await openImported(page, name, buildV2File(name, [A, B, C]));
}

test("Quick Find with results and with no results has no axe violations", async ({ page }) => {
  await openFixture(page, "Axe quick find");
  await page.locator("[data-sa-canvas]").focus();
  await page.keyboard.press(`${await modifierFor(page)}+k`);
  const dialog = page.getByRole("dialog", { name: "Find component" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox").fill("a");
  await expect(dialog.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expectNoA11yViolations(page);

  await dialog.getByRole("combobox").fill("nothing like this");
  await expect(dialog.getByRole("status")).toHaveText('No components match "nothing like this"');
  await expectNoA11yViolations(page);
});

test("the Arrange menu open has no axe violations", async ({ page }) => {
  await openFixture(page, "Axe arrange");
  await selectTwoComponents(page, A.name, B.name);
  await page.locator(".sa-toolbar").getByRole("button", { name: "Arrange", exact: true }).click();
  await expect(page.getByRole("menu", { name: "Arrange" })).toBeVisible();
  await expectNoA11yViolations(page);
});

test("the Versions list and the restore confirmation have no axe violations", async ({ page }) => {
  await openFixture(page, "Axe versions");
  const versions = page.locator(".sa-toolbar").getByRole("button", { name: "Versions", exact: true });
  await versions.click();
  let dialog = page.getByRole("dialog", { name: "Versions of 'Axe versions'" });
  await expect(dialog.locator("li.sa-versions__row")).toHaveCount(1);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();

  // A second version, so one row is restorable.
  await nodeById(page, C.id).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Delete");
  await page.getByRole("dialog", { name: "Delete 1 component?" }).getByRole("button", { name: "Delete", exact: true }).click();
  await versions.click();
  dialog = page.getByRole("dialog", { name: "Versions of 'Axe versions'" });
  await dialog.getByRole("button", { name: "Save version now" }).click();
  await expect(dialog.getByText("Version saved.")).toBeVisible();
  await expect(dialog.locator("li.sa-versions__row")).toHaveCount(2);
  await expectNoA11yViolations(page);

  await dialog.locator("li.sa-versions__row").last().getByRole("button", { name: /^Restore the version from/ }).click();
  await expect(page.getByRole("dialog", { name: /^Restore the version from .*\?$/ })).toBeVisible();
  await expectNoA11yViolations(page);
});

test("the multi-selection inspector in the mixed color state has no axe violations (MC5)", async ({ page }) => {
  await openFixture(page, "Axe mixed color");
  await selectTwoComponents(page, A.name, B.name);
  await expect(page.getByText("Color: Mixed (2 colors)")).toBeVisible();
  await expectNoA11yViolations(page);
});
