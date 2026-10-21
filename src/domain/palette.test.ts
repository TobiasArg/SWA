import { beforeAll, describe, expect, it } from "vitest";
import { ACCENT_IDS } from "./constants";
import { PALETTE, PALETTE_IDS, effectivePaletteId, typePaletteId } from "./palette";

// CSS imports are empty under Vitest, so tokens.css is read from disk (as in ComponentNode.test.tsx).
let tokens = "";

beforeAll(async () => {
  const fsModule = "node:fs";
  const fs = (await import(/* @vite-ignore */ fsModule)) as {
    readFileSync(path: string, encoding: "utf8"): string;
  };
  tokens = fs.readFileSync("src/ui/tokens.css", "utf8");
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

describe("palette resolver (AC-C1)", () => {
  it("returns the accent when valid, else the type default", () => {
    expect(effectivePaletteId({ type: "tool", accent: "teal" })).toBe("teal");
    expect(effectivePaletteId({ type: "tool" })).toBe("type-tool");
    expect(effectivePaletteId({ type: "memory", accent: "bogus" as never })).toBe("type-memory");
    expect(effectivePaletteId({ type: "agent", subtype: "orchestrator" })).toBe("type-orchestrator");
    expect(typePaletteId({ type: "external_system" })).toBe("type-external");
    expect(typePaletteId({ type: "decision" })).toBe("type-decision");
    expect(typePaletteId({ type: "agent" })).toBe("type-agent");
  });
});

describe("palette tokens (AC-C2)", () => {
  it("mirrors tokens.css hex values", () => {
    for (const id of PALETTE_IDS) {
      const entry = PALETTE[id];
      if (id.startsWith("type-")) {
        const t = id.slice(5);
        expect(entry.ink).toBe(token(`--sa-type-${t}-ink`));
        expect(entry.fill).toBe(token(`--sa-type-${t}-fill`));
      } else {
        expect(entry.ink).toBe(token(`--sa-accent-${id}-ink`));
        expect(entry.fill).toBe(token(`--sa-accent-${id}-tint`));
      }
    }
  });

  it("declares exactly one [data-palette] rule per entry", () => {
    expect(PALETTE_IDS).toHaveLength(6 + ACCENT_IDS.length);
    for (const id of PALETTE_IDS) {
      expect(tokens.split(`[data-palette="${id}"]`).length - 1).toBe(1);
    }
    expect(tokens.match(/\[data-palette="/g)).toHaveLength(PALETTE_IDS.length);
  });
});

describe("palette contrast (AC-C3)", () => {
  const white = "#FFFFFF";

  it.each(PALETTE_IDS)("%s passes every paired check", (id) => {
    const text = token("--sa-color-text");
    const muted = token("--sa-color-text-muted");
    const canvas = token("--sa-color-canvas");
    const select = token("--sa-color-accent");
    const { ink, fill } = PALETTE[id];
    expect(contrast(ink, fill)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ink, white)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(text, fill)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(muted, fill)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ink, canvas)).toBeGreaterThanOrEqual(3);
    expect(contrast(select, fill)).toBeGreaterThanOrEqual(3);
  });
});
