// Regenerates the browser icons from the "Abeja Bit" pixel grid (blue abdomen) in src/ui/BrandMark.tsx:
//   public/favicon.svg          16 x 16 vector, recolours the abdomen and body for dark browser themes
//   public/favicon.ico          16 and 32 px PNG frames (1x and 2x), transparent
//   public/apple-touch-icon.png 180 px, opaque neutral white tile, the bee at a whole 9x scale
// Rasters are written cell by cell (no browser, no resampling), so every edge is crisp and
// the output is byte-for-byte reproducible. Run with `node scripts/build-brand-icons.mjs`.
import { Buffer } from "node:buffer";
import { log } from "node:console";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { deflateSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");

export const INKS = {
  wing: [0xa1, 0xbb, 0xdc],
  abdomen: [0x3b, 0x66, 0xd9],
  stripe: [0x1f, 0x1d, 0x1a],
  body: [0x1f, 0x1d, 0x1a],
};
const ABDOMEN_ON_DARK = "#5B84E6";
const BODY_ON_DARK = "#F3EBDD";
export const TILE = [0xff, 0xff, 0xff];
const LAYERS = ["wing", "abdomen", "stripe", "body"];

/** Reads BRAND_MARK_PATHS from the React component, the single source of the artwork. */
export function readBrandPaths(source = readFileSync(join(root, "src/ui/BrandMark.tsx"), "utf8")) {
  const paths = {};
  for (const layer of LAYERS) {
    const match = new RegExp(`${layer}:\\s*"([^"]+)"`).exec(source);
    if (!match) throw new Error(`BrandMark.tsx has no ${layer} path`);
    paths[layer] = match[1];
  }
  return paths;
}

/** Expands "Mx yhWv1h-Wz" runs into a 16 x 16 grid of layer names (null = transparent). */
export function toGrid(paths) {
  const grid = Array.from({ length: 16 }, () => Array(16).fill(null));
  for (const layer of LAYERS) {
    const runs = [...paths[layer].matchAll(/M(\d+) (\d+)h(\d+)v(\d+)h-\d+z/g)];
    if (runs.length === 0) throw new Error(`Unreadable ${layer} path`);
    for (const [, x, y, w, h] of runs) {
      for (let dy = 0; dy < Number(h); dy += 1) {
        for (let dx = 0; dx < Number(w); dx += 1) {
          const row = grid[Number(y) + dy];
          if (row[Number(x) + dx]) throw new Error(`Overlapping cell at ${Number(x) + dx},${Number(y) + dy}`);
          row[Number(x) + dx] = layer;
        }
      }
    }
  }
  return grid;
}

export function faviconSvg(paths) {
  const hex = (rgb) => `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><style>` +
    `.w{fill:${hex(INKS.wing)}}.a{fill:${hex(INKS.abdomen)}}.s,.b{fill:${hex(INKS.body)}}` +
    `@media (prefers-color-scheme:dark){.a{fill:${ABDOMEN_ON_DARK}}.b{fill:${BODY_ON_DARK}}}</style>` +
    `<g shape-rendering="crispEdges"><path class="w" d="${paths.wing}"/><path class="a" d="${paths.abdomen}"/>` +
    `<path class="s" d="${paths.stripe}"/><path class="b" d="${paths.body}"/></g></svg>\n`
  );
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Encodes a PNG: RGBA (colour type 6) when transparent, RGB (type 2) when `background` is set. */
export function renderPng(grid, { size, scale, offsetX = 0, offsetY = 0, background = null }) {
  const channels = background ? 3 : 4;
  const stride = size * channels + 1;
  const pixels = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y += 1) {
    pixels[y * stride] = 0; // filter: none
    for (let x = 0; x < size; x += 1) {
      const gx = Math.floor((x - offsetX) / scale);
      const gy = Math.floor((y - offsetY) / scale);
      const inside = x >= offsetX && y >= offsetY && gx < 16 && gy < 16;
      const layer = inside ? grid[gy][gx] : null;
      const rgb = layer ? INKS[layer] : background;
      const at = y * stride + 1 + x * channels;
      if (rgb) pixels.set(rgb, at);
      if (!background) pixels[at + 3] = layer ? 255 : 0;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = background ? 2 : 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** An ICO container whose frames are PNGs (ICONDIR + one ICONDIRENTRY per frame). */
export function buildIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  let offset = 6 + 16 * frames.length;
  const entries = frames.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry[0] = size;
    entry[1] = size;
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...frames.map(({ png }) => png)]);
}

function main() {
  const paths = readBrandPaths();
  const grid = toGrid(paths);
  writeFileSync(join(publicDir, "favicon.svg"), faviconSvg(paths));
  writeFileSync(
    join(publicDir, "favicon.ico"),
    buildIco([
      { size: 16, png: renderPng(grid, { size: 16, scale: 1 }) },
      { size: 32, png: renderPng(grid, { size: 32, scale: 2 }) },
    ]),
  );
  // 9x keeps cells on whole pixels; the occupied 16 x 11 box (rows 2-12) is centred at (90, 90.5).
  writeFileSync(
    join(publicDir, "apple-touch-icon.png"),
    renderPng(grid, { size: 180, scale: 9, offsetX: 18, offsetY: 23, background: TILE }),
  );
  log("Wrote public/favicon.svg, public/favicon.ico and public/apple-touch-icon.png");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
