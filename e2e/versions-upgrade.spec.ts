import { expect, test, type Page } from "@playwright/test";
import { openLibrary } from "./helpers";

// ROADMAP_V2_DESIGN §6.2 (VS9): the IndexedDB v1 → v2 upgrade keeps data, and old or newer
// tabs are reported with app messages instead of "storage unavailable" or a blank screen.

const DATABASE = "swarm-architecturer";
const BLOCKED = "Finishing an update. Close or reload other Swarm Architecturer tabs to continue.";
const BLOCKING = "Swarm Architecturer was updated in another tab. Reload this tab to keep saving.";

const SEEDED = {
  schemaVersion: 2,
  architecture: {
    id: "arch_seeded_v1",
    name: "Seeded before the upgrade",
    description: "Written by a v1 database.",
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-02T08:00:00.000Z",
    components: [
      { id: "cmp_seed_a", type: "agent", name: "Seeded Agent", position: { x: 80, y: 80 } },
      { id: "cmp_seed_b", type: "tool", name: "Seeded Tool", position: { x: 420, y: 80 } },
    ],
    relationships: [{ id: "rel_seed", type: "uses", sourceId: "cmp_seed_a", targetId: "cmp_seed_b", direction: "directed" }],
    groups: [],
  },
};

/** A same-origin page that does not run the app, so the app never opens the database first. */
async function openBlankSameOrigin(page: Page): Promise<void> {
  await page.goto("/THIRD_PARTY_LICENSES.md");
}

async function seedVersionOne(page: Page): Promise<void> {
  await page.evaluate(
    ({ name, record }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => request.result.createObjectStore("architectures", { keyPath: "architecture.id" });
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("architectures", "readwrite");
          transaction.objectStore("architectures").put(record);
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
    { name: DATABASE, record: SEEDED },
  );
}

async function readDatabase(page: Page) {
  return page.evaluate(
    (name) =>
      new Promise<{ version: number; stores: string[]; record: unknown }>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const get = database.transaction("architectures").objectStore("architectures").get("arch_seeded_v1");
          get.onsuccess = () => {
            resolve({ version: database.version, stores: [...database.objectStoreNames], record: get.result });
            database.close();
          };
          get.onerror = () => reject(get.error);
        };
      }),
    DATABASE,
  );
}

test("a v1 database upgrades to v2 without changing its architectures", async ({ page }) => {
  await openBlankSameOrigin(page);
  await seedVersionOne(page);

  await openLibrary(page);
  const link = page.getByRole("link", { name: SEEDED.architecture.name });
  await expect(link).toBeVisible();
  await expect(link.locator("xpath=ancestor::tr")).toContainText("2 components");

  const upgraded = await readDatabase(page);
  expect(upgraded.version).toBe(2);
  expect(upgraded.stores.sort()).toEqual(["architectures", "snapshots"]);
  expect(upgraded.record).toEqual(SEEDED);

  await link.click();
  await expect(page.getByRole("textbox", { name: "Architecture name" })).toHaveValue(SEEDED.architecture.name);
  await expect(page.locator(".react-flow__node-component")).toHaveCount(2);
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
});

test("an old tab blocks the upgrade with a message, and opening resumes when it closes", async ({ page, context }) => {
  await openBlankSameOrigin(page);
  await seedVersionOne(page);

  // An old v1 tab: its connection has no versionchange handler, so it never closes by itself.
  const oldTab = await context.newPage();
  await openBlankSameOrigin(oldTab);
  await oldTab.evaluate(
    (name) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          (window as Window & { __saOldConnection?: IDBDatabase }).__saOldConnection = request.result;
          resolve();
        };
      }),
    DATABASE,
  );

  await page.goto("/app/#/");
  await expect(page.getByText(BLOCKED)).toBeVisible();
  await expect(page.getByText("Storage is unavailable")).toHaveCount(0);

  await oldTab.evaluate(() => (window as Window & { __saOldConnection?: IDBDatabase }).__saOldConnection?.close());
  await expect(page.getByRole("link", { name: SEEDED.architecture.name })).toBeVisible();
  await expect(page.getByText(BLOCKED)).toHaveCount(0);
  await oldTab.close();
});

test("a newer version in another tab makes this tab show the reload banner", async ({ page, context }) => {
  await openLibrary(page);
  await expect(page.getByText("No architectures yet.")).toBeVisible();

  const newerTab = await context.newPage();
  await openBlankSameOrigin(newerTab);
  const upgraded = newerTab.evaluate(
    (name) =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open(name, 3);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const { version } = request.result;
          request.result.close();
          resolve(version);
        };
      }),
    DATABASE,
  );

  const banner = page.getByRole("alert").filter({ hasText: BLOCKING });
  await expect(banner).toBeVisible();
  await expect(banner.getByRole("button", { name: "Reload", exact: true })).toBeVisible();
  // This tab closed its connection, so the newer version's upgrade is not blocked.
  expect(await upgraded).toBe(3);
  await newerTab.close();
});
