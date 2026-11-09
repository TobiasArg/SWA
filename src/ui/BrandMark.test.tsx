import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BRAND_MARK_PATHS, BrandMark } from "./BrandMark";

// The pixel map of docs/brand/logo-variants/c-abeja-bit.svg (w wing, h abdomen, # ink).
const SOURCE = [
  "................",
  "................",
  ".........ww.....",
  "...wwww.wwww....",
  "..wwwwww.www....",
  "...wwwww.ww....h",
  "......wwww....#.",
  "..h#hh#..##.##..",
  ".hh#hh#h###.#.#.",
  "#hh#hh#h#######.",
  ".hh#hh#h###.##..",
  "..h#hh#..##.....",
  "........#.#.....",
  "................",
  "................",
  "................",
];

function cells(d: string): string[] {
  const out: string[] = [];
  for (const [, x, y, w, h] of d.matchAll(/M(\d+) (\d+)h(\d+)v(\d+)h-\d+z/g)) {
    for (let dy = 0; dy < Number(h); dy += 1) {
      for (let dx = 0; dx < Number(w); dx += 1) out.push(`${Number(x) + dx},${Number(y) + dy}`);
    }
  }
  return out;
}

function sourceCells(symbol: string): string[] {
  return SOURCE.flatMap((row, y) => [...row].flatMap((c, x) => (c === symbol ? [`${x},${y}`] : [])));
}

describe("BrandMark", () => {
  it("renders a decorative 16-cell SVG at the requested whole-multiple size", () => {
    const { container } = render(<BrandMark size={32} className="extra" />);
    const svg = container.querySelector("svg")!;

    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
    expect(svg).toHaveAttribute("viewBox", "0 0 16 16");
    expect(svg).toHaveAttribute("width", "32");
    expect(svg).toHaveAttribute("height", "32");
    expect(svg).toHaveClass("sa-brand-mark", "extra");
    expect(svg.querySelectorAll("path")).toHaveLength(4);
  });

  it("reproduces the selected source artwork pixel for pixel", () => {
    expect(new Set(cells(BRAND_MARK_PATHS.wing))).toEqual(new Set(sourceCells("w")));
    expect(new Set(cells(BRAND_MARK_PATHS.abdomen))).toEqual(new Set(sourceCells("h")));
    const ink = [...cells(BRAND_MARK_PATHS.stripe), ...cells(BRAND_MARK_PATHS.body)];
    expect(ink).toHaveLength(37);
    expect(new Set(ink)).toEqual(new Set(sourceCells("#")));
  });

  it("keeps the stripes inside the abdomen and the eye as a hole", () => {
    const all = Object.values(BRAND_MARK_PATHS).flatMap(cells);
    expect(new Set(all).size).toBe(all.length);
    expect(all).not.toContain("13,8");
    for (const cell of cells(BRAND_MARK_PATHS.stripe)) {
      expect(["3", "6"]).toContain(cell.split(",")[0]);
    }
  });
});
