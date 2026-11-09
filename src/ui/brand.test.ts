import { beforeAll, describe, expect, it } from "vitest";

// CSS imports are empty under Vitest, so tokens.css is read from disk (as in palette.test.ts).
let tokens = "";
let favicon = "";

beforeAll(async () => {
  const fsModule = "node:fs";
  const fs = (await import(/* @vite-ignore */ fsModule)) as {
    readFileSync(path: string, encoding: "utf8"): string;
  };
  tokens = fs.readFileSync("src/ui/tokens.css", "utf8");
  favicon = fs.readFileSync("public/favicon.svg", "utf8");
});

function token(name: string): string {
  const match = new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6});`).exec(tokens);
  if (!match) throw new Error(`missing token ${name}`);
  return match[1]!.toUpperCase();
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe("brand tokens", () => {
  it("define the Abeja Bit inks with the blue abdomen", () => {
    expect(token("--sa-brand-ink")).toBe("#1F1D1A");
    expect(token("--sa-brand-abdomen")).toBe("#3B66D9");
    expect(token("--sa-brand-wing")).toBe("#A1BBDC");
  });

  it("restore the original palette: blue primary actions and neutral surfaces", () => {
    expect(token("--sa-color-canvas")).toBe("#F7F6F3");
    expect(token("--sa-color-surface")).toBe("#FFFFFF");
    expect(token("--sa-color-surface-sunken")).toBe("#EFECE6");
    expect(token("--sa-color-border-strong")).toBe("#8C8679");
    expect(tokens).not.toMatch(/--sa-color-primary|--sa-color-on-primary|--sa-brand-honey/);
  });

  it("keep the functional interaction blue for selection, ports and links", () => {
    expect(token("--sa-color-accent")).toBe("#2650C8");
  });

  it.each([
    ["--sa-color-text", "--sa-color-canvas"],
    ["--sa-color-text-muted", "--sa-color-canvas"],
    ["--sa-color-text-muted", "--sa-color-surface"],
    ["--sa-color-text-muted", "--sa-color-surface-sunken"],
    ["--sa-color-on-accent", "--sa-color-accent"],
    ["--sa-color-on-accent", "--sa-color-accent-hover"],
    ["--sa-color-accent", "--sa-color-canvas"],
  ])("%s on %s meets 4.5:1", (fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ["--sa-color-border-strong", "--sa-color-canvas"],
    ["--sa-color-border-strong", "--sa-color-surface"],
    ["--sa-group-border", "--sa-color-canvas"],
  ])("%s on %s meets 3:1", (fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(3);
  });

  it("keeps the blue abdomen legible against the stripes and the browser tabs", () => {
    const abdomen = token("--sa-brand-abdomen");
    expect(contrast(abdomen, token("--sa-brand-ink"))).toBeGreaterThanOrEqual(3);
    expect(contrast(abdomen, "#DEE1E6")).toBeGreaterThanOrEqual(3);
    expect(contrast("#5B84E6", "#35363A")).toBeGreaterThanOrEqual(3);
  });

  it("recolours the favicon abdomen and body for dark browser themes with strong contrast", () => {
    expect(favicon).toContain('viewBox="0 0 16 16"');
    expect(favicon).toContain("crispEdges");
    expect(favicon).not.toMatch(/\swidth=/);
    expect(favicon).toMatch(/@media \(prefers-color-scheme:dark\)\{\.a\{fill:#5B84E6\}\.b\{fill:#F3EBDD\}\}/);
    expect(contrast("#F3EBDD", "#202124")).toBeGreaterThanOrEqual(4.5);
    expect(favicon.length).toBeLessThan(2048);
  });
});
