import { error as consoleError, log } from "node:console";
import { readFileSync } from "node:fs";
import process from "node:process";
import { gzipSync } from "node:zlib";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const manifestPath = join(dist, ".vite", "manifest.json");
const VITE_CHUNK_LIMIT_BYTES = 500 * 1024;
// Baseline is the measured post-split initial graph; the budget adds 10% headroom.
const MEASURED_INITIAL_GZIP_BYTES = 109_580;
const INITIAL_GZIP_BUDGET_BYTES = Math.ceil((MEASURED_INITIAL_GZIP_BYTES * 11) / 10);
const MAX_INITIAL_GZIP_BUDGET_BYTES = 156 * 1024;

function isJavaScript(file) {
  return /\.(?:m?js|c?js)$/i.test(file);
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(2)} KiB (${bytes.toLocaleString("en-US")} bytes)`;
}

function readDistFile(file) {
  const absolute = resolve(dist, file);
  const rootPath = resolve(dist) + sep;
  if (!absolute.startsWith(rootPath)) {
    throw new Error(`Manifest file escapes dist/: ${file}`);
  }
  return readFileSync(absolute);
}

function failIf(condition, message, errors) {
  if (condition) errors.push(message);
}

const errors = [];
let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (error) {
  consoleError(`Bundle check failed: cannot read ${relative(root, manifestPath)} (${error.message}).`);
  process.exit(1);
}

const entries = Object.entries(manifest).filter(([, chunk]) => chunk.isEntry && isJavaScript(chunk.file ?? ""));
failIf(entries.length === 0, "No JavaScript entry was found in the Vite manifest.", errors);

const initialKeys = new Set();
function visitStaticImports(key) {
  if (initialKeys.has(key)) return;
  const chunk = manifest[key];
  if (!chunk) {
    errors.push(`Manifest references missing static import key ${key}.`);
    return;
  }
  initialKeys.add(key);
  for (const importedKey of chunk.imports ?? []) visitStaticImports(importedKey);
}
for (const [key] of entries) visitStaticImports(key);

const allJavaScriptFiles = new Set();
const moduleIdsByFile = new Map();
for (const [key, chunk] of Object.entries(manifest)) {
  if (isJavaScript(chunk.file ?? "")) allJavaScriptFiles.add(chunk.file);
  if (!isJavaScript(chunk.file ?? "")) continue;
  if (!Array.isArray(chunk.moduleIds) || chunk.moduleIds.length === 0) {
    errors.push(`Manifest entry ${key} lacks actual Rolldown moduleIds metadata.`);
    continue;
  }
  moduleIdsByFile.set(chunk.file, chunk.moduleIds.map((moduleId) => moduleId.replaceAll("\\", "/")));
}

let largestChunk = { file: "(none)", bytes: 0 };
for (const file of allJavaScriptFiles) {
  try {
    const bytes = readDistFile(file).length;
    if (bytes > largestChunk.bytes) largestChunk = { file, bytes };
    failIf(bytes > VITE_CHUNK_LIMIT_BYTES, `${file} is ${formatBytes(bytes)}, over the 500 KiB chunk limit.`, errors);
  } catch (error) {
    errors.push(`Cannot inspect JavaScript chunk ${file} (${error.message}).`);
  }
}

const initialFiles = new Set();
const initialIdentities = new Set();
const initialModuleIds = new Set();
for (const key of initialKeys) {
  const chunk = manifest[key];
  if (!chunk || !isJavaScript(chunk.file ?? "")) continue;
  initialFiles.add(chunk.file);
  for (const identity of [key, chunk.src, chunk.name, chunk.file]) {
    if (identity) initialIdentities.add(identity.replaceAll("\\", "/"));
  }
  if (!Array.isArray(chunk.moduleIds) || chunk.moduleIds.length === 0) {
    errors.push(`Initial manifest entry ${key} has no actual Rolldown moduleIds metadata.`);
    continue;
  }
  for (const moduleId of chunk.moduleIds) initialModuleIds.add(moduleId.replaceAll("\\", "/"));
}

const initialBytes = [];
for (const file of initialFiles) {
  try {
    initialBytes.push(readDistFile(file));
  } catch (error) {
    errors.push(`Cannot read initial JavaScript chunk ${file} (${error.message}).`);
  }
}
const initialRawBytes = initialBytes.reduce((total, bytes) => total + bytes.length, 0);
const initialGzipBytes = initialBytes.reduce((total, bytes) => total + gzipSync(bytes, { level: 9 }).length, 0);

const forbiddenModules = [
  { label: "@xyflow packages", pattern: /(?:^|\/)node_modules\/@xyflow\// },
  { label: "html-to-image", pattern: /(?:^|\/)node_modules\/html-to-image(?:\/|$)/ },
  { label: "canvas/editor UI code", pattern: /(?:^|\/)src\/(?:canvas|editor|inspector|palette)\// },
  { label: "lazy editor route code", pattern: /(?:^|\/)src\/app\/(?:EditorRoute|EditorScreen|defaultModules)\.(?:tsx|ts)$/ },
];
for (const moduleId of initialModuleIds) {
  for (const { label, pattern } of forbiddenModules) {
    failIf(pattern.test(moduleId), `Initial JavaScript includes ${label} module ${moduleId}.`, errors);
  }
}
for (const identity of initialIdentities) {
  failIf(
    /(?:^|\/)flow-vendor(?:[-.]|$)/.test(identity),
    `Initial static chunk graph includes Flow vendor chunk ${identity}.`,
    errors,
  );
}

const lazyModulePatterns = [
  { label: "EditorRoute", pattern: /(?:^|\/)src\/app\/EditorRoute\.tsx(?:$|\s)/ },
  { label: "EditorScreen", pattern: /(?:^|\/)src\/app\/EditorScreen\.tsx(?:$|\s)/ },
  { label: "defaultModules", pattern: /(?:^|\/)src\/app\/defaultModules\.ts(?:$|\s)/ },
  { label: "html-to-image", pattern: /(?:^|\/)node_modules\/html-to-image(?:\/|$)/ },
];
const manifestIdentities = Object.entries(manifest).map(([key, chunk]) => ({
  key,
  identity: [key, chunk.src, chunk.name, chunk.file].filter(Boolean).join(" ").replaceAll("\\", "/"),
}));
for (const { label, pattern } of lazyModulePatterns) {
  const lazyEntries = manifestIdentities.filter(({ identity }) => pattern.test(identity));
  failIf(lazyEntries.length === 0, `Manifest has no lazy entry for ${label}.`, errors);
  for (const { key } of lazyEntries) {
    failIf(initialKeys.has(key), `Initial static graph eagerly includes ${label} (${key}).`, errors);
  }
}

const appSource = readFileSync(join(root, "src", "app", "App.tsx"), "utf8");
const zodJitlessEnabled = /configureZod\(\s*\{\s*jitless\s*:\s*true\s*\}\s*\)/.test(appSource);
const dynamicCodePattern = /\beval\s*\(|\bnew\s+Function\s*\(|\bFunction\s*\(/g;
const dynamicCodeFindings = [];
for (const file of allJavaScriptFiles) {
  const code = readDistFile(file).toString("utf8");
  const matches = [...code.matchAll(dynamicCodePattern)];
  if (matches.length === 0) continue;

  const modules = moduleIdsByFile.get(file) ?? [];
  const zodProbeModule = modules.some((moduleId) => /(?:^|\/)node_modules\/zod\/v4\/core\/util\.[cm]?js(?:$|\?)/.test(moduleId));
  if (matches.length !== 1 || !zodProbeModule || !zodJitlessEnabled) {
    errors.push(
      `Built JavaScript ${file} contains eval/Function code without an identified, disabled Zod CSP probe (${modules.join(", ")}).`,
    );
    continue;
  }
  dynamicCodeFindings.push({ file, count: matches.length });
}

if (INITIAL_GZIP_BUDGET_BYTES > MAX_INITIAL_GZIP_BUDGET_BYTES) {
  errors.push(
    `Configured initial gzip budget ${formatBytes(INITIAL_GZIP_BUDGET_BYTES)} exceeds the 156 KiB hard cap.`,
  );
}
failIf(
  initialGzipBytes > INITIAL_GZIP_BUDGET_BYTES,
  `Initial JS gzip is ${formatBytes(initialGzipBytes)}, over its ${formatBytes(INITIAL_GZIP_BUDGET_BYTES)} budget.`,
  errors,
);

const viteConfig = readFileSync(join(root, "vite.config.ts"), "utf8");
failIf(/\bchunkSizeWarningLimit\b/.test(viteConfig), "vite.config.ts must not override chunkSizeWarningLimit.", errors);

const indexHtml = readFileSync(join(dist, "index.html"), "utf8");
for (const match of indexHtml.matchAll(/<script\b([^>]*)>/gi)) {
  if (!/\bsrc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i.test(match[1] ?? "")) {
    errors.push("Built index.html contains an inline script, which violates the production CSP.");
  }
}

log(
  `Bundle metrics: ${allJavaScriptFiles.size} JS chunks; largest ${largestChunk.file} ${formatBytes(largestChunk.bytes)}; ` +
    `initial ${formatBytes(initialRawBytes)} raw / ${formatBytes(initialGzipBytes)} gzip; ` +
    `initial gzip budget ${formatBytes(INITIAL_GZIP_BUDGET_BYTES)}.`,
);

if (errors.length) {
  consoleError(`Bundle check failed with ${errors.length} issue${errors.length === 1 ? "" : "s"}:`);
  for (const issue of errors) consoleError(`- ${issue}`);
  process.exitCode = 1;
} else {
  log("Bundle check passed: chunk sizes, initial graph, gzip budget and CSP inline-script check are within limits.");
}
if (dynamicCodeFindings.length) {
  for (const { file, count } of dynamicCodeFindings) {
    log(
      `CSP audit: ${file} contains ${count} Zod Function probe(s); App enables Zod jitless mode before validation, so the probe is skipped.`,
    );
  }
}
