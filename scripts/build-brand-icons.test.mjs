import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildIco, faviconSvg, readBrandPaths, renderPng, toGrid } from "./build-brand-icons.mjs";

const grid = toGrid(readBrandPaths());

test("public/favicon.svg matches the BrandMark artwork", () => {
  assert.equal(readFileSync("public/favicon.svg", "utf8"), faviconSvg(readBrandPaths()));
});

test("public/favicon.ico holds the regenerated 16 and 32 px frames", () => {
  const expected = buildIco([
    { size: 16, png: renderPng(grid, { size: 16, scale: 1 }) },
    { size: 32, png: renderPng(grid, { size: 32, scale: 2 }) },
  ]);
  assert.deepEqual(readFileSync("public/favicon.ico"), expected);
});

test("public/apple-touch-icon.png is the opaque 180 px render at 9x", () => {
  const png = readFileSync("public/apple-touch-icon.png");
  assert.equal(png.readUInt32BE(16), 180);
  assert.equal(png.readUInt32BE(20), 180);
  assert.equal(png[25], 2, "RGB colour type: no alpha channel");
  assert.deepEqual(
    png,
    renderPng(grid, { size: 180, scale: 9, offsetX: 18, offsetY: 23, background: [0xff, 0xff, 0xff] }),
  );
});

test("toGrid rejects overlapping cells", () => {
  assert.throws(
    () => toGrid({ wing: "M0 0h1v1h-1z", abdomen: "M0 0h1v1h-1z", stripe: "M1 1h1v1h-1z", body: "M2 2h1v1h-1z" }),
    /Overlapping/,
  );
});
