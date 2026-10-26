import { render } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

const hintMock = vi.hoisted(() => ({ value: { targetId: null as string | null, activeSide: null as string | null } }));
vi.mock("../nodeContext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../nodeContext")>()),
  useConnectHint: () => hintMock.value,
}));
import { ACCENTS, ACCENT_IDS } from "../../domain/constants";
import type { Component } from "../../domain/types";
import { EditorProvider } from "../../editor/context";
import { CanvasView } from "../CanvasView";
import { createFakeStore } from "../testing/fakeStore";
import { buildFixtureArchitecture } from "../testing/fixtures";
import { SELECTION_INFLATE, extrusionPath, shapePath, type ShapeKind } from "../shapes";

// Vitest replaces CSS imports (including ?raw) with empty strings, so the
// stylesheets are read from disk. jsdom cannot compute custom properties from
// stylesheets either, so the palette tests resolve var() chains from the rule text.
let tokensCss = "";
let canvasCss = "";
let rootTokens: Record<string, string> = {};

beforeAll(async () => {
  const fsModule = "node:fs";
  const fs = (await import(/* @vite-ignore */ fsModule)) as {
    readFileSync(path: string, encoding: "utf8"): string;
  };
  const read = (relative: string) =>
    fs.readFileSync(decodeURIComponent(new URL(relative, import.meta.url).pathname), "utf8");
  tokensCss = read("../../ui/tokens.css");
  canvasCss = read("../canvas.css");
  rootTokens = declarations(ruleBody(tokensCss, ":root"));
});

beforeAll(() => {
  // jsdom lacks the layout APIs React Flow touches.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  globalThis.DOMMatrixReadOnly ??= class {
    m22 = 1;
    constructor() {}
  } as unknown as typeof DOMMatrixReadOnly;
});

const ACCENTED: Record<string, string> = {
  cmp_discovery: "teal",
  cmp_orch: "tomato",
  cmp_crm: "indigo",
  cmp_store: "fern",
  // Not a valid accent ID: must never reach the DOM (TD 3.4).
  cmp_search: "neon",
};

function renderNodes() {
  const architecture = buildFixtureArchitecture();
  architecture.components = architecture.components.map(
    (component) =>
      (ACCENTED[component.id] ? { ...component, accent: ACCENTED[component.id] } : component) as Component,
  );
  const result = render(
    <EditorProvider store={createFakeStore(architecture)}>
      <div style={{ width: 800, height: 600 }}>
        <CanvasView />
      </div>
    </EditorProvider>,
  );
  const node = (id: string) =>
    result.container.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"] .sa-node`)!;
  return { ...result, node };
}

/** The declaration block of the first rule whose selector is exactly `selector`. */
function ruleBody(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `rule ${selector}`).toBeGreaterThanOrEqual(0);
  return css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
}

function declarations(body: string): Record<string, string> {
  return Object.fromEntries(
    body
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const colon = part.indexOf(":");
        return [part.slice(0, colon).trim(), part.slice(colon + 1).trim()];
      }),
  );
}


/**
 * Resolves a var() chain (with an optional fallback) against `scope`, then :root
 * tokens (jsdom does not compute custom properties).
 */
function resolveToken(value: string, scope: Record<string, string> = {}): string {
  const match = /^var\((--[\w-]+)(?:,\s*(.+))?\)$/.exec(value.trim());
  if (!match) return value.trim();
  const name = match[1]!;
  const next = scope[name] ?? rootTokens[name] ?? match[2];
  expect(next, `token ${name}`).toBeDefined();
  return resolveToken(next!, scope);
}

describe("ComponentNode silhouettes", () => {
  it("renders the expected shape kind per type; Agent and Orchestrator share the rounded shape", () => {
    const { node } = renderNodes();
    expect(node("cmp_orch")).toHaveAttribute("data-shape", "rounded");
    expect(node("cmp_discovery")).toHaveAttribute("data-shape", "rounded");
    expect(node("cmp_search")).toHaveAttribute("data-shape", "octagon");
    expect(node("cmp_store")).toHaveAttribute("data-shape", "cylinder");
    expect(node("cmp_crm")).toHaveAttribute("data-shape", "parallelogram");
    expect(node("cmp_router")).toHaveAttribute("data-shape", "hexagon");

    // Same silhouette path for Agent and Orchestrator at the same size; they differ by band and label.
    const orchBody = node("cmp_orch").querySelector(".sa-node__body")!.getAttribute("d");
    const agentBody = node("cmp_discovery").querySelector(".sa-node__body")!.getAttribute("d");
    expect(orchBody).toBe(agentBody);
    expect(node("cmp_orch").querySelector('[data-detail="band"]')).not.toBeNull();
    expect(node("cmp_discovery").querySelector('[data-detail="band"]')).toBeNull();
    expect(node("cmp_orch").querySelector(".sa-node__type-label")).toHaveTextContent("ORCHESTRATOR");
    expect(node("cmp_discovery").querySelector(".sa-node__type-label")).toHaveTextContent("AGENT");
    // The orchestrator glyph sits in the band without a chip; other types get the 24 px chip.
    expect(node("cmp_orch").querySelector(".sa-node__chip")).toBeNull();
    expect(node("cmp_discovery").querySelector(".sa-node__chip .sa-node__icon")).not.toBeNull();

    expect(node("cmp_store").querySelector('[data-detail="rim"]')).not.toBeNull();
    expect(node("cmp_crm").querySelector('[data-detail="hatch"]')).not.toBeNull();
  });

  it("draws one inline SVG without url(#...) references, patterns, clip paths or gradients", () => {
    const { node } = renderNodes();
    for (const id of Object.keys(ACCENTED)) {
      const svg = node(id).querySelectorAll("svg.sa-node__shape");
      expect(svg).toHaveLength(1);
      const markup = svg[0]!.outerHTML;
      expect(markup).not.toMatch(/url\(#|<pattern|<clipPath|<marker|Gradient/);
      const order = Array.from(svg[0]!.children).map((child) => child.getAttribute("class"));
      expect(order.slice(0, 5)).toEqual([
        "sa-node__shadow",
        "sa-node__halo",
        "sa-node__selection",
        "sa-node__depth",
        "sa-node__body",
      ]);
    }
  });

  it("draws the fixed 2.5D volume under the unmoved top face; halo and selection wrap the whole volume", () => {
    const { node } = renderNodes();
    for (const id of ["cmp_orch", "cmp_search", "cmp_store", "cmp_crm", "cmp_router"]) {
      const el = node(id);
      const kind = el.dataset.shape as ShapeKind;
      const svg = el.querySelector<SVGSVGElement>("svg.sa-node__shape")!;
      const w = Number(svg.getAttribute("width"));
      const h = Number(svg.getAttribute("height"));
      expect(el.querySelector(".sa-node__body")!.getAttribute("d")).toBe(shapePath(kind, w, h));
      expect(el.querySelector(".sa-node__depth")!.getAttribute("d")).toBe(extrusionPath(kind, w, h));
      expect(el.querySelector(".sa-node__shadow")!.getAttribute("d")).toBe(extrusionPath(kind, w, h));
      const ring = extrusionPath(kind, w, h, SELECTION_INFLATE);
      expect(el.querySelector(".sa-node__halo")!.getAttribute("d")).toBe(ring);
      expect(el.querySelector(".sa-node__selection")!.getAttribute("d")).toBe(ring);
      // The extrusion paints outside the node box; the SVG must not clip it.
      expect(svg.getAttribute("overflow")).toBe("visible");
    }
  });

  it("styles depth and shadow without filters, blur or color-mix, and keeps them in the PNG export", () => {
    const depth = declarations(ruleBody(canvasCss, ".sa-node__depth"));
    expect(depth.fill).toBe("var(--sa-node-depth)");
    expect(depth.stroke).toBe("var(--sa-node-border)");
    const shadow = declarations(ruleBody(canvasCss, ".sa-node__shadow"));
    expect(shadow.fill).toBe("var(--sa-node-shadow)");
    const forcedStart = canvasCss.indexOf("@media (forced-colors: active)");
    const nodeRules = canvasCss
      .slice(0, forcedStart)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("}")
      .filter((rule) => /sa-node__(?:depth|shadow)/.test(rule.split("{")[0] ?? ""));
    for (const rule of nodeRules) expect(rule).not.toMatch(/filter|blur|drop-shadow|color-mix|display:\s*none/);
    // The forced-colors block is the only place the shadow is hidden.
    const forced = canvasCss.slice(forcedStart);
    expect(forced).toMatch(/\.sa-node__shadow\s*\{\s*display: none;/);
  });

  it("places the four source ports on the outline (parallelogram side midpoints on the slant)", () => {
    const { node } = renderNodes();
    const ports = node("cmp_crm").querySelectorAll<HTMLElement>(".react-flow__handle.sa-port");
    expect(Array.from(ports).map((port) => port.dataset.handleid)).toEqual(["top", "right", "bottom", "left"]);
    const left = Array.from(ports).find((port) => port.dataset.handleid === "left")!;
    // External default size 220 x 80 (or stored size); left anchor is (skew / 2, h / 2).
    expect(left.style.left).toBe("7px");
    expect(left.classList.contains("source")).toBe(true);
  });
});

describe("ComponentNode palette (UI_COLOR_CONFIRMATION_DESIGN §1)", () => {
  const TYPE_NODES: Record<string, string> = {
    cmp_discovery: "type-agent",
    cmp_orch: "type-orchestrator",
    cmp_search: "type-tool",
    cmp_store: "type-memory",
    cmp_crm: "type-external",
    cmp_router: "type-decision",
  };

  /** Per-node custom properties for one palette entry: `.sa-node` plus its `[data-palette]` rule. */
  function nodeScope(palette: string): Record<string, string> {
    return {
      ...declarations(ruleBody(tokensCss, `[data-palette="${palette}"]`)),
      ...declarations(ruleBody(canvasCss, ".sa-node")),
    };
  }

  it("sets data-accent only for valid accent IDs and keeps aria-labels free of colour words", () => {
    const { node, container } = renderNodes();
    expect(node("cmp_discovery")).toHaveAttribute("data-accent", "teal");
    expect(node("cmp_orch")).toHaveAttribute("data-accent", "tomato");
    expect(node("cmp_search")).not.toHaveAttribute("data-accent");
    expect(node("cmp_validation")).not.toHaveAttribute("data-accent");
    for (const label of Array.from(container.querySelectorAll(".react-flow__node-component")).map((n) =>
      n.getAttribute("aria-label"),
    )) {
      expect(label).not.toMatch(new RegExp(ACCENT_IDS.join("|"), "i"));
    }
  });

  it("sets data-palette to the effective entry: the accent, else the type default", () => {
    const { node } = renderNodes();
    expect(node("cmp_discovery")).toHaveAttribute("data-palette", "teal");
    expect(node("cmp_orch")).toHaveAttribute("data-palette", "tomato");
    expect(node("cmp_crm")).toHaveAttribute("data-palette", "indigo");
    expect(node("cmp_store")).toHaveAttribute("data-palette", "fern");
    // Invalid accent falls back to the type default.
    expect(node("cmp_search")).toHaveAttribute("data-palette", "type-tool");
    expect(node("cmp_router")).toHaveAttribute("data-palette", "type-decision");
  });

  it("AC-C8: never renders data-palette or data-accent on groups", () => {
    const { container } = renderNodes();
    const groups = container.querySelectorAll(".react-flow__node-group-container");
    expect(groups.length).toBeGreaterThan(0);
    for (const group of Array.from(groups)) {
      expect(group.querySelector("[data-accent]")).toBeNull();
      expect(group.querySelector("[data-palette]")).toBeNull();
      expect(group.closest("[data-palette]")).toBeNull();
    }
  });

  it("defines ink and tint tokens for all 16 accents matching the domain palette", () => {
    for (const id of ACCENT_IDS) {
      expect(rootTokens[`--sa-accent-${id}-ink`]?.toUpperCase()).toBe(ACCENTS[id].ink.toUpperCase());
      expect(rootTokens[`--sa-accent-${id}-tint`]?.toUpperCase()).toBe(ACCENTS[id].tint.toUpperCase());
    }
  });

  it("gives every palette entry a fixed-hex depth tone between its fill and its ink", () => {
    const hex = (value: string) => {
      expect(value, value).toMatch(/^#[0-9A-F]{6}$/i);
      return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
    };
    const luminance = (value: string) => hex(value).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i]!, 0);
    const entries = [...Object.values(TYPE_NODES), ...ACCENT_IDS];
    for (const palette of entries) {
      const scope = nodeScope(palette);
      const depth = resolveToken(scope["--sa-node-depth"]!, scope);
      const fill = resolveToken(scope["--sa-node-fill"]!, scope);
      const ink = resolveToken(scope["--sa-node-ink"]!, scope);
      // Visibly darker than the top face, still well lighter than the outline ink.
      expect(luminance(fill) - luminance(depth), palette).toBeGreaterThan(20);
      expect(luminance(depth) - luminance(ink), palette).toBeGreaterThan(60);
    }
  });

  it("AC-C4: only .sa-node maps the palette, and no rule selects on data-accent", () => {
    expect(canvasCss).not.toContain("[data-accent");
    const nodeVars = /(--sa-node-(?:ink|fill|depth|border|chip-[\w-]+|label-ink))\s*:/g;
    const rules = canvasCss.replace(/\/\*[\s\S]*?\*\//g, "").split("}");
    for (const rule of rules) {
      const [selector = "", body = ""] = rule.split("{");
      if (!nodeVars.test(body)) continue;
      nodeVars.lastIndex = 0;
      expect(selector.trim(), `rule declaring ${body.match(nodeVars)}`).toBe(".sa-node");
    }
    // Neither ports, edges nor groups read a palette variable: only .sa-node does.
    const paletteReaders = rules
      .filter((rule) => rule.includes("--sa-palette-"))
      .map((rule) => rule.split("{")[0]!.trim());
    expect(paletteReaders).toEqual([".sa-node"]);
  });

  it("AC-C5: teal drives fill, border, chip, label, rim and band on every type; the chip plate stays white", () => {
    const { node } = renderNodes();
    expect(node("cmp_discovery")).toHaveAttribute("data-palette", "teal");
    const scope = nodeScope("teal");
    const resolve = (property: string) => resolveToken(scope[property]!, scope);
    expect(resolve("--sa-node-fill")).toBe("#C9EAEA");
    for (const property of ["--sa-node-ink", "--sa-node-border", "--sa-node-chip-ink", "--sa-node-label-ink"]) {
      expect(resolve(property), property).toBe("#106A6E");
    }
    expect(resolve("--sa-node-chip-fill")).toBe("#FFFFFF");

    const body = declarations(ruleBody(canvasCss, ".sa-node__body"));
    expect(body.fill).toBe("var(--sa-node-fill)");
    expect(body.stroke).toBe("var(--sa-node-border)");
    const band = declarations(ruleBody(canvasCss, ".sa-node__detail--band"));
    expect(resolveToken(band.fill!, scope)).toBe("#106A6E");
    const rim = declarations(ruleBody(canvasCss, ".sa-node__detail--rim"));
    expect(resolveToken(rim.stroke!, scope)).toBe("#106A6E");
    const hatch = declarations(ruleBody(canvasCss, ".sa-node__detail--hatch"));
    expect(resolveToken(hatch.stroke!, scope)).toBe("#106A6E");
    expect(hatch["stroke-opacity"]).toBe("0.16");
    // Text never takes the fill; the name keeps the inherited text color.
    expect(declarations(ruleBody(canvasCss, ".sa-node__name")).color).toBeUndefined();
    // The Orchestrator type row stays white on the band.
    const orchRow = declarations(ruleBody(canvasCss, '.sa-node[data-subtype="orchestrator"] .sa-node__type'));
    expect(resolveToken(orchRow.color!)).toBe("#FFFFFF");
  });

  it("AC-C6: without an accent each type resolves to its existing type ink and fill", () => {
    const { node } = renderNodes();
    expect(node("cmp_router")).toHaveAttribute("data-palette", "type-decision");
    for (const palette of Object.values(TYPE_NODES)) {
      const type = palette.slice("type-".length);
      const scope = nodeScope(palette);
      expect(resolveToken(scope["--sa-node-ink"]!, scope), palette).toBe(rootTokens[`--sa-type-${type}-ink`]);
      expect(resolveToken(scope["--sa-node-fill"]!, scope), palette).toBe(rootTokens[`--sa-type-${type}-fill`]);
    }
  });

  it("AC-C7: shape, details, dash source, icon and type label do not change with any accent", () => {
    const signature = (accent?: string) => {
      const architecture = buildFixtureArchitecture();
      architecture.components = architecture.components.map((component) => {
        const { accent: _drop, ...rest } = component;
        return (accent ? { ...rest, accent } : rest) as Component;
      });
      const { container, unmount } = render(
        <EditorProvider store={createFakeStore(architecture)}>
          <div style={{ width: 800, height: 600 }}>
            <CanvasView />
          </div>
        </EditorProvider>,
      );
      const result = Object.keys(TYPE_NODES).map((id) => {
        const el = container.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"] .sa-node`)!;
        expect(el).toHaveAttribute("data-palette", accent ?? TYPE_NODES[id]);
        return {
          id,
          shape: el.dataset.shape,
          type: el.dataset.type,
          subtype: el.dataset.subtype,
          details: Array.from(el.querySelectorAll("[data-detail]")).map((d) => d.getAttribute("data-detail")),
          icon: el.querySelector(".sa-node__icon")!.outerHTML,
          label: el.querySelector(".sa-node__type-label")!.textContent,
        };
      });
      unmount();
      return result;
    };
    const baseline = signature();
    for (const accent of ACCENT_IDS) {
      expect(signature(accent), accent).toEqual(baseline);
    }
    // The dash pattern is keyed on data-type only.
    expect(declarations(ruleBody(canvasCss, '.sa-node[data-type="external_system"] .sa-node__body'))).toEqual({
      "stroke-dasharray": "6 4",
    });
  });
});

describe("ComponentNode connect hint", () => {
  it("marks the hovered target and fills only the port that would be used", () => {
    hintMock.value = { targetId: "cmp_crm", activeSide: "left" };
    const store = createFakeStore(buildFixtureArchitecture());
    const { container } = render(
      <EditorProvider store={store}>
        <div style={{ width: 800, height: 600 }}>
          <CanvasView />
        </div>
      </EditorProvider>,
    );
    const crm = container.querySelector('.react-flow__node[data-id="cmp_crm"]')!;
    expect(crm.querySelector(".sa-node")).toHaveAttribute("data-connect-target", "true");
    const active = crm.querySelectorAll(".sa-port--active");
    expect(active).toHaveLength(1);
    expect(active[0]).toHaveAttribute("data-port", "left");
    expect(container.querySelectorAll('[data-connect-target="true"]')).toHaveLength(1);
    expect(container.querySelectorAll(".sa-port--active")).toHaveLength(1);
    hintMock.value = { targetId: null, activeSide: null };
  });
});
