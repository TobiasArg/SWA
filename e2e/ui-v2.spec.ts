import { expect, test } from "@playwright/test";
import {
  analyzePng,
  buildV2File,
  centerOf,
  chooseRelationshipType,
  componentNodeByName,
  connectViaDialog,
  dragFromPort,
  edgeSnapshot,
  downloadBuffer,
  exportJsonFile,
  maybeSavePng,
  nodeById,
  openImported,
  portLocator,
  waitForSaved,
} from "./helpers";

test.use({ viewport: { width: 1600, height: 1000 } });

const A = { id: "cmp_a", type: "agent", name: "Alpha Agent", x: 100, y: 150 } as const;
const B = { id: "cmp_b", type: "tool", name: "Beta Tool", x: 650, y: 150 } as const;

/** Screen point at the horizontal center of a node's body, away from its ports. */
async function bodyPoint(page: import("@playwright/test").Page, id: string) {
  const c = await centerOf(nodeById(page, id));
  return { x: c.x, y: c.y };
}

async function relationshipsOf(page: import("@playwright/test").Page) {
  const { parsed } = await exportJsonFile(page);
  return parsed.architecture.relationships;
}

test.describe("UI v2 — ports and curved edges", () => {
  test("15: port to port drag pins right -> left and renders path and arrowhead on those ports", async ({ page }) => {
    await openImported(page, "UI v2 15", buildV2File("UI v2 15", [A, B]));
    await dragFromPort(page, A.id, "right", await centerOf(portLocator(page, B.id, "left")));
    await chooseRelationshipType(page, "Uses");
    await expect(page.locator(".react-flow__edge")).toHaveCount(1);
    await waitForSaved(page);

    const [rel] = await relationshipsOf(page);
    expect(rel?.visual?.ports).toEqual({ source: "right", target: "left" });

    const edge = await edgeSnapshot(page);
    const [sourceTerminal, targetTerminal] = [
      edge.terminals.find((t) => t.terminal === "source")!,
      edge.terminals.find((t) => t.terminal === "target")!,
    ];
    expect([sourceTerminal.side, targetTerminal.side]).toEqual(["right", "left"]);
    // The path starts on the outer edge of the source ring: A's right anchor + TERMINAL_RADIUS along +x.
    const start = edge.d.match(/^M\s*(-?[\d.]+)\s+(-?[\d.]+)/)!;
    expect(Number(start[1])).toBeCloseTo(sourceTerminal.cx + sourceTerminal.r, 1);
    expect(Number(start[2])).toBeCloseTo(sourceTerminal.cy, 1);
    // The terminal sits on the actual port handles (screen centers agree).
    const portA = await centerOf(portLocator(page, A.id, "right"));
    const portB = await centerOf(portLocator(page, B.id, "left"));
    const circles = page.locator(".react-flow__edge .sa-edge-terminal");
    const sourceCircle = await centerOf(circles.nth(0));
    const targetCircle = await centerOf(circles.nth(1));
    expect(Math.hypot(sourceCircle.x - portA.x, sourceCircle.y - portA.y)).toBeLessThan(2);
    expect(Math.hypot(targetCircle.x - portB.x, targetCircle.y - portB.y)).toBeLessThan(2);
    // The arrowhead points into B's left port: it ends just left of the target ring, spanning to the left of it.
    expect(edge.hasArrow).toBe(true);
    const arrow = edge.arrowBox!;
    expect(arrow.x + arrow.width).toBeLessThanOrEqual(portB.x + 1);
    expect(arrow.x + arrow.width).toBeGreaterThan(portB.x - sourceTerminal.r - 4);
    expect(arrow.x).toBeLessThan(portB.x - sourceTerminal.r - 4);
  });

  test("16: port to body drop pins only the source and the highlighted port equals the rendered target port", async ({ page }) => {
    await openImported(page, "UI v2 16", buildV2File("UI v2 16", [A, B]));
    let highlighted: string | null = null;
    await dragFromPort(page, A.id, "right", await bodyPoint(page, B.id), async () => {
      const active = nodeById(page, B.id).locator(".sa-port--active");
      await expect(active).toHaveCount(1);
      highlighted = await active.getAttribute("data-port");
    });
    await chooseRelationshipType(page, "Uses");
    await expect(page.locator(".react-flow__edge")).toHaveCount(1);
    await waitForSaved(page);

    const [rel] = await relationshipsOf(page);
    expect(rel?.visual?.ports).toEqual({ source: "right" });
    const edge = await edgeSnapshot(page);
    expect(highlighted).not.toBeNull();
    expect(edge.terminals.find((t) => t.terminal === "target")!.side).toBe(highlighted);
  });

  test("17: Connect dialog writes no visual and the automatic route follows the nodes (right -> left, then bottom -> top)", async ({ page }) => {
    await openImported(page, "UI v2 17", buildV2File("UI v2 17", [A, B]));
    await connectViaDialog(page, A.name, B.name, "Uses");
    await waitForSaved(page);

    const [rel] = await relationshipsOf(page);
    expect(rel?.visual).toBeUndefined();
    let edge = await edgeSnapshot(page);
    expect(edge.terminals.map((t) => t.side)).toEqual(["right", "left"]);

    // Move B below A (and left so it is clearly in the vertical band).
    const b = await centerOf(nodeById(page, B.id));
    await page.mouse.move(b.x, b.y);
    await page.mouse.down();
    await page.mouse.move(b.x - 550, b.y + 300, { steps: 10 });
    await page.mouse.up();
    await expect
      .poll(async () => (await edgeSnapshot(page)).terminals.map((t) => t.side))
      .toEqual(["bottom", "top"]);
    edge = await edgeSnapshot(page);
    expect(edge.terminals.map((t) => t.terminal)).toEqual(["source", "target"]);
    // Still no persisted pins after the move.
    await waitForSaved(page);
    expect((await relationshipsOf(page))[0]?.visual).toBeUndefined();
  });

  test("18: undirected shares_context_with has no arrowhead, two identical terminals, and is independent of stored order", async ({ page }) => {
    const forward = buildV2File("UI v2 18 fwd", [A, B], [
      { id: "rel_u", type: "shares_context_with", sourceId: A.id, targetId: B.id, direction: "undirected" },
    ]);
    await openImported(page, "UI v2 18 fwd", forward);
    const fwd = await edgeSnapshot(page);
    expect(fwd.hasArrow).toBe(false);
    expect(fwd.dashed).toBe(true);
    expect(fwd.terminals).toHaveLength(2);
    expect(fwd.terminals[0]!.r).toBe(fwd.terminals[1]!.r);
    await expect(page.locator(".react-flow__edge .sa-edge-arrow")).toHaveCount(0);
    await expect(page.locator(".react-flow__edge marker, .react-flow__edge [marker-end]")).toHaveCount(0);

    // Same relationship stored in the opposite order: geometry is compared (path and terminal
    // coordinates) instead of pixels. Undirected geometry is built in canonical order
    // (UI_V2_REFINEMENT 2.2 step 0), so the path string is byte-identical.
    const reversed = buildV2File("UI v2 18 rev", [A, B], [
      { id: "rel_u", type: "shares_context_with", sourceId: B.id, targetId: A.id, direction: "undirected" },
    ]);
    await openImported(page, "UI v2 18 rev", reversed);
    const rev = await edgeSnapshot(page);
    expect(rev.hasArrow).toBe(false);
    const key = (t: { side: string; cx: number; cy: number; r: number }) =>
      `${t.side}:${t.cx.toFixed(2)}:${t.cy.toFixed(2)}:${t.r}`;
    expect(rev.terminals.map(key).sort()).toEqual(fwd.terminals.map(key).sort());
    expect(rev.d).toBe(fwd.d);
  });

  test("19: Reset ports to automatic removes the pins in one undo step", async ({ page }) => {
    await openImported(page, "UI v2 19", buildV2File("UI v2 19", [A, B], [
      {
        id: "rel_p",
        type: "uses",
        sourceId: A.id,
        targetId: B.id,
        direction: "directed",
        visual: { ports: { source: "bottom", target: "bottom" } },
      },
    ]));
    expect((await edgeSnapshot(page)).terminals.map((t) => t.side)).toEqual(["bottom", "bottom"]);
    await page.locator(".react-flow__edge").first().focus();
    await page.keyboard.press("Enter");
    const reset = page.getByRole("button", { name: "Reset ports to automatic" });
    await expect(reset).toBeVisible();
    await reset.click();
    await expect(reset).toHaveCount(0);
    await expect
      .poll(async () => (await edgeSnapshot(page)).terminals.map((t) => t.side))
      .toEqual(["right", "left"]);
    await waitForSaved(page);
    expect((await relationshipsOf(page))[0]?.visual?.ports).toBeUndefined();

    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.getByRole("button", { name: "Reset ports to automatic" })).toBeVisible();
    expect((await edgeSnapshot(page)).terminals.map((t) => t.side)).toEqual(["bottom", "bottom"]);
    // One undo step restored both pins; a second undo must not be needed.
    await waitForSaved(page);
    expect((await relationshipsOf(page))[0]?.visual?.ports).toEqual({ source: "bottom", target: "bottom" });
  });
});

test.describe("UI v2 — accent and schema v2", () => {
  test("accent survives reload, undo/redo, duplicate and JSON round trip; PNG export succeeds", async ({ page }) => {
    await openImported(page, "UI v2 accent", buildV2File("UI v2 accent", [A, B]));
    const outer = await componentNodeByName(page, A.name);
    // data-accent lives on the inner .sa-node element.
    const node = outer.locator(".sa-node");
    await expect(node).not.toHaveAttribute("data-accent", /.+/);
    await outer.click();
    await page.locator('label[title="Teal"]').click();
    await expect(node).toHaveAttribute("data-accent", "teal");
    await waitForSaved(page);

    // Undo / redo.
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(node).not.toHaveAttribute("data-accent", /.+/);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(node).toHaveAttribute("data-accent", "teal");
    await waitForSaved(page);

    // Reload (persisted in IndexedDB).
    await page.reload();
    await expect(nodeById(page, A.id).locator(".sa-node")).toHaveAttribute("data-accent", "teal");

    // Duplicate copies the accent.
    await nodeById(page, A.id).click();
    await page.getByRole("button", { name: "Duplicate", exact: true }).click();
    await expect(page.locator(".react-flow__node-component")).toHaveCount(3);
    await expect(page.locator('.react-flow__node-component [data-accent="teal"]')).toHaveCount(2);
    await waitForSaved(page);

    // JSON export: schema 2, accent after size (key order) and import round trip.
    const { raw, parsed } = await exportJsonFile(page);
    expect(parsed.schemaVersion).toBe(2);
    const teal = parsed.architecture.components.filter((c) => c.accent === "teal");
    expect(teal).toHaveLength(2);
    const keys = Object.keys(teal[0]);
    expect(keys.indexOf("accent")).toBeGreaterThan(keys.indexOf("position"));
    if (keys.includes("size")) expect(keys.indexOf("accent")).toBeGreaterThan(keys.indexOf("size"));

    await page.getByRole("button", { name: "Library", exact: true }).click();
    await page.getByRole("button", { name: "Import JSON" }).click();
    await page.locator('input[type="file"][accept*="application/json"]').setInputFiles({
      name: "accent.json",
      mimeType: "application/json",
      buffer: Buffer.from(raw),
    });
    await expect(page.getByRole("textbox", { name: "Architecture name" })).toHaveValue("UI v2 accent (imported)");
    await expect(page.locator('.react-flow__node-component [data-accent="teal"]')).toHaveCount(2);

    // PNG export succeeds with an accent present.
    const png = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export" }).click();
    await page.getByRole("menuitem", { name: "PNG image" }).click();
    expect((await png).suggestedFilename()).toMatch(/\.png$/);
  });

  test("a v1 fixture imports without losing fields and re-exports as schemaVersion 2", async ({ page }) => {
    const { readFile } = await import("node:fs/promises");
    const v1Raw = await readFile(new URL("./fixtures/lead-hunting-engine.json", import.meta.url), "utf8");
    const v1 = JSON.parse(v1Raw);
    expect(v1.schemaVersion).toBe(1);

    await page.goto("/#/");
    await page.getByRole("button", { name: "Import JSON" }).click();
    await page.locator('input[type="file"][accept*="application/json"]').setInputFiles({
      name: "lhe.json",
      mimeType: "application/json",
      buffer: Buffer.from(v1Raw),
    });
    await expect(page.getByRole("textbox", { name: "Architecture name" })).toHaveValue("Lead Hunting Engine");
    await expect(page.locator(".react-flow__node-component")).toHaveCount(v1.architecture.components.length);

    const { parsed } = await exportJsonFile(page);
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.architecture.components).toEqual(v1.architecture.components);
    expect(parsed.architecture.relationships).toEqual(v1.architecture.relationships);
    // Group bounds are re-fitted to their members by the editor on load (pre-existing behavior,
    // not part of v2), so everything but `bounds` must be unchanged.
    const stripBounds = (groups: object[]) =>
      groups.map((group) => Object.fromEntries(Object.entries(group).filter(([key]) => key !== "bounds")));
    expect(stripBounds(parsed.architecture.groups)).toEqual(stripBounds(v1.architecture.groups));
    expect(parsed.architecture.name).toBe(v1.architecture.name);
  });
});

test.describe("UI v2 — PNG export bounds", () => {
  test("20: a curve that bulges beyond the node bounds is fully inside the image; no ports or selection", async ({ page }) => {
    // right -> right pins on vertically separated nodes: the cubic bulges to the right of both nodes.
    await openImported(page, "UI v2 20", buildV2File("UI v2 20",
      [
        { ...A, x: 100, y: 100, accent: "teal" },
        { ...B, x: 100, y: 450 },
      ],
      [{
        id: "rel_bulge",
        type: "uses",
        sourceId: A.id,
        targetId: B.id,
        direction: "directed",
        label: "a deliberately long label for the plate",
        visual: { ports: { source: "right", target: "right" } },
      }],
    ));
    // Keep a node selected so the export must hide the selection.
    await nodeById(page, A.id).click();

    const nodeBoxes = await Promise.all([A.id, B.id].map((id) => nodeById(page, id).boundingBox()));
    const nodesWidth =
      Math.max(...nodeBoxes.map((b) => b!.x + b!.width)) - Math.min(...nodeBoxes.map((b) => b!.x));
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export" }).click();
    await page.getByRole("menuitem", { name: "PNG image" }).click();
    const png = await downloadBuffer(await download);
    await maybeSavePng(png, "ui-v2-bulge.png");
    const analysis = await analyzePng(page, png);

    // The image (CSS px = device px / 2) is wider than nodes + 2 x 48 padding by the bulge (>= 40 px).
    expect(analysis.width / 2).toBeGreaterThan(nodesWidth + 96 + 40);
    // Nothing is clipped: the frame is clean and the curve (rightmost content) keeps a margin.
    expect(analysis.touchesEdge).toBe(false);
    const c = analysis.content!;
    expect(c.right).toBeLessThan(analysis.width - 40);
    expect(c.left).toBeGreaterThan(4);
    // The selected node's outline is not exported.
    expect(analysis.selectionPixels).toBe(0);
  });
});

test.describe("UI v2 refinement — curves and labels (UI_V2_REFINEMENT 3.5)", () => {
  // Agents A, B, C (220 × 88) at x = 100, 400, 700 (y = 100): 80 px gaps.
  const reviewFixture = () =>
    buildV2File(
      "UI v2 review layout",
      [
        { id: "cmp_ra", type: "agent", name: "Agent A", x: 100, y: 100 },
        { id: "cmp_rb", type: "agent", name: "Agent B", x: 400, y: 100 },
        { id: "cmp_rc", type: "agent", name: "Agent C", x: 700, y: 100 },
      ],
      [
        { id: "rel_ab", type: "delegates_to", sourceId: "cmp_ra", targetId: "cmp_rb", direction: "directed", label: "coordinates" },
        { id: "rel_bc", type: "uses", sourceId: "cmp_rb", targetId: "cmp_rc", direction: "directed" },
        { id: "rel_share", type: "shares_context_with", sourceId: "cmp_rb", targetId: "cmp_rc", direction: "undirected" },
      ] as Parameters<typeof buildV2File>[2],
    );
  const expectedLabels: Record<string, string> = {
    rel_ab: "delegates to · coordinates",
    rel_bc: "uses",
    rel_share: "shares context with",
  };

  test("E1: every relationship path bows at least 5 px away from its endpoint chord", async ({ page }) => {
    await openImported(page, "UI v2 review layout", reviewFixture());
    await expect(page.locator(".react-flow__edge")).toHaveCount(3);
    const deviations = await page.locator(".sa-edge-path").evaluateAll((paths) =>
      paths.map((element) => {
        const path = element as SVGPathElement;
        const length = path.getTotalLength();
        const start = path.getPointAtLength(0);
        const end = path.getPointAtLength(length);
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const chord = Math.hypot(dx, dy);
        let max = 0;
        for (let i = 0; i <= 100; i += 1) {
          const p = path.getPointAtLength((length * i) / 100);
          max = Math.max(max, Math.abs((p.x - start.x) * dy - (p.y - start.y) * dx) / chord);
        }
        return max;
      }),
    );
    expect(deviations).toHaveLength(3);
    for (const deviation of deviations) expect(deviation).toBeGreaterThanOrEqual(5);
  });

  test("E2: label plates never overlap nodes, keep the full text, and A→B gets a callout leader", async ({ page }) => {
    await openImported(page, "UI v2 review layout", reviewFixture());
    await expect(page.locator(".react-flow__edge")).toHaveCount(3);
    const result = await page.evaluate(() => {
      const box = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      return {
        plates: [...document.querySelectorAll(".react-flow__edge-textbg")].map(box),
        nodes: [...document.querySelectorAll(".react-flow__node-component")].map(box),
        edges: [...document.querySelectorAll(".react-flow__edge")].map((edge) => ({
          id: edge.getAttribute("data-id") ?? "",
          text: [...edge.querySelectorAll(".react-flow__edge-text tspan")].map((t) => t.textContent).join(" "),
          leader: edge.querySelectorAll(".sa-edge-leader").length,
        })),
      };
    });
    expect(result.nodes).toHaveLength(3);
    expect(result.plates).toHaveLength(3);
    const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    for (const plate of result.plates) {
      for (const node of result.nodes) expect(overlap(plate, node), JSON.stringify({ plate, node })).toBe(false);
    }
    expect(Object.fromEntries(result.edges.map((edge) => [edge.id, edge.text]))).toEqual(expectedLabels);
    expect(result.edges.find((edge) => edge.id === "rel_ab")!.leader).toBe(1);
  });
});
