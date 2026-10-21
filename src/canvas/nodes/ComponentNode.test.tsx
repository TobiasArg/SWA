import { render } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { ACCENTS, ACCENT_IDS } from "../../domain/constants";
import type { Component } from "../../domain/types";
import { EditorProvider } from "../../editor/context";
import { CanvasView } from "../CanvasView";
import { createFakeStore } from "../testing/fakeStore";
import { buildFixtureArchitecture } from "../testing/fixtures";

// Vitest replaces CSS imports (including ?raw) with empty strings, so the
// stylesheets are read from disk. jsdom cannot compute custom properties from
// stylesheets either, so the accent tests resolve var() chains from the rule text.
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


/** Resolves a var() chain against :root tokens (jsdom does not compute custom properties). */
function resolveToken(value: string, scope: Record<string, string> = {}): string {
  const match = /^var\((--[\w-]+)\)$/.exec(value.trim());
  if (!match) return value.trim();
  const name = match[1]!;
  const next = scope[name] ?? rootTokens[name];
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
      expect(order.slice(0, 3)).toEqual(["sa-node__halo", "sa-node__selection", "sa-node__body"]);
    }
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

describe("ComponentNode accent", () => {
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

  it("never renders data-accent on groups", () => {
    const { container } = renderNodes();
    const groups = container.querySelectorAll(".react-flow__node-group-container");
    expect(groups.length).toBeGreaterThan(0);
    for (const group of Array.from(groups)) {
      expect(group.querySelector("[data-accent]")).toBeNull();
    }
  });

  it("defines ink and tint tokens for all 16 accents matching the domain palette", () => {
    for (const id of ACCENT_IDS) {
      expect(rootTokens[`--sa-accent-${id}-ink`]?.toUpperCase()).toBe(ACCENTS[id].ink.toUpperCase());
      expect(rootTokens[`--sa-accent-${id}-tint`]?.toUpperCase()).toBe(ACCENTS[id].tint.toUpperCase());
    }
  });

  it("teal: the body stroke resolves to #106A6E while fill, label and text keep the type style", () => {
    const { node } = renderNodes();
    const accented = node("cmp_discovery");
    expect(accented.querySelector(".sa-node__body")).not.toBeNull();

    const base = declarations(ruleBody(canvasCss, ".sa-node"));
    const teal = { ...base, ...declarations(ruleBody(canvasCss, '.sa-node[data-accent="teal"]')) };
    const body = declarations(ruleBody(canvasCss, ".sa-node__body"));

    expect(body.fill).toBe("var(--sa-node-fill)");
    expect(body.stroke).toBe("var(--sa-node-border)");
    expect(resolveToken(teal["--sa-node-border"]!, teal)).toBe("#106A6E");
    expect(resolveToken(teal["--sa-node-fill"]!, teal)).toBe(rootTokens["--sa-type-agent-fill"]);
    expect(resolveToken(teal["--sa-node-label-ink"]!, teal)).toBe(rootTokens["--sa-type-agent-ink"]);
    expect(resolveToken(teal["--sa-node-chip-fill"]!, teal)).toBe("#C9EAEA");
    // Accent rules touch only border and chip variables, never fill or text.
    for (const id of ACCENT_IDS) {
      const keys = Object.keys(declarations(ruleBody(canvasCss, `.sa-node[data-accent="${id}"]`))).sort();
      expect(keys).toEqual(["--sa-node-border", "--sa-node-chip-fill", "--sa-node-chip-ink"]);
    }
    const name = declarations(ruleBody(canvasCss, ".sa-node__name"));
    expect(name.color).toBeUndefined();
  });

  it("orchestrator band stays the orchestrator ink with an accent", () => {
    const { node } = renderNodes();
    expect(node("cmp_orch")).toHaveAttribute("data-accent", "tomato");
    const band = node("cmp_orch").querySelector('[data-detail="band"]')!;
    expect(band).toHaveClass("sa-node__detail--band");
    const bandRule = declarations(ruleBody(canvasCss, ".sa-node__detail--band"));
    expect(resolveToken(bandRule.fill!)).toBe("#1D3557");
    const hatchRule = declarations(ruleBody(canvasCss, ".sa-node__detail--hatch"));
    expect(hatchRule.stroke).toBe("var(--sa-type-external-hatch)");
  });
});
