import { expect, test } from "@playwright/test";
import { addComponent, createArchitecture, downloadBuffer, openLibrary, waitForSaved } from "./helpers";

const NAME = "Notes Markdown E2E";
const FILENAME = "notes-markdown-e2e.md";
const NOTES = [
  "## Plan",
  "",
  "- first **step**",
  "",
  "<b>raw html</b>",
  "",
  "![remote](https://example.com/remote.png)",
].join("\n");

test("Notes are labelled in Edit and Preview, survive switching, and export as Markdown", async ({ page }) => {
  const remoteRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).hostname === "example.com") remoteRequests.push(request.url());
  });

  await openLibrary(page);
  await createArchitecture(page, NAME);
  await addComponent(page, "Agent", "Planner");
  await page.locator("summary.sa-inspector__summary", { hasText: "Documentation" }).click();

  const textarea = page.getByRole("textbox", { name: "Notes", exact: true });
  const label = page.locator("label.sa-field__label", { hasText: /^Notes$/ });
  const editToggle = page.getByRole("group", { name: "Notes view" }).getByRole("button", { name: "Edit" });
  const previewToggle = page.getByRole("group", { name: "Notes view" }).getByRole("button", { name: "Preview" });

  // Edit mode: the visible label names the textarea.
  await expect(editToggle).toHaveAttribute("aria-pressed", "true");
  await expect(label).toHaveAttribute("for", (await textarea.getAttribute("id"))!);
  await textarea.fill(NOTES);

  // Preview mode (keyboard): the label names the preview region and points at nothing missing.
  await previewToggle.focus();
  await page.keyboard.press("Enter");
  await expect(previewToggle).toHaveAttribute("aria-pressed", "true");
  await expect(previewToggle).toBeFocused();
  await expect(textarea).toHaveCount(0);
  await expect(label).not.toHaveAttribute("for");
  const region = page.getByRole("region", { name: "Notes", exact: true });
  await expect(region).toBeVisible();
  await expect(region).toHaveAccessibleName("Notes");
  await expect(region).toHaveAccessibleDescription("Markdown");
  await expect(page.getByLabel("Notes", { exact: true })).toHaveCount(1);
  await expect(region.getByRole("heading", { name: "Plan" })).toBeVisible();
  await expect(region.getByRole("listitem")).toHaveText("first step");
  // Safe rendering: raw HTML is not rendered as markup and remote images are never fetched.
  await expect(region.locator("b, img")).toHaveCount(0);

  // Back to Edit: the draft is intact and the textarea is labelled again.
  await editToggle.click();
  await expect(textarea).toHaveValue(NOTES);
  await expect(label).toHaveAttribute("for", (await textarea.getAttribute("id"))!);
  await waitForSaved(page);

  // Export from the editor menu.
  const editorDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  await page.getByRole("menuitem", { name: "Markdown document" }).click();
  const fromEditor = await editorDownload;
  expect(fromEditor.suggestedFilename()).toBe(FILENAME);
  const editorMarkdown = (await downloadBuffer(fromEditor)).toString("utf8");
  expect(editorMarkdown.startsWith(`# ${NAME}\n`)).toBe(true);
  expect(editorMarkdown).toContain("### Planner");
  expect(editorMarkdown).toContain(`**Notes**\n\n${NOTES}`);

  // Export from the library row: same file name and identical content.
  await page.getByRole("button", { name: "Library", exact: true }).click();
  const libraryDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: `Export Markdown of ${NAME}` }).click();
  const fromLibrary = await libraryDownload;
  expect(fromLibrary.suggestedFilename()).toBe(FILENAME);
  expect((await downloadBuffer(fromLibrary)).toString("utf8")).toBe(editorMarkdown);

  expect(remoteRequests).toEqual([]);
});

test("Library row actions wrap instead of overflowing at a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
  await openLibrary(page);
  await createArchitecture(page, NAME);
  await waitForSaved(page);
  await page.getByRole("button", { name: "Library", exact: true }).click();

  const actions = page.locator(".sa-library-row__action-list").first();
  await expect(actions.getByRole("button", { name: `Export Markdown of ${NAME}` })).toBeVisible();
  const layout = await actions.evaluate((list) => {
    const buttons = [...list.querySelectorAll("button")].map((button) => button.getBoundingClientRect());
    const box = list.getBoundingClientRect();
    return {
      rows: new Set(buttons.map((rect) => Math.round(rect.top))).size,
      contained: buttons.every((rect) => rect.left >= box.left - 1 && rect.right <= box.right + 1),
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(layout.rows).toBeGreaterThan(1);
  expect(layout.contained).toBe(true);
  expect(layout.pageOverflow).toBeLessThanOrEqual(0);
});
