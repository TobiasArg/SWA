import { error as consoleError, log } from "node:console";
import { readFileSync } from "node:fs";
import process from "node:process";
import { gzipSync } from "node:zlib";
import { dirname, join, relative, resolve, sep } from "node:path";
import ts from "typescript";
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

function isZodCall(node, method) {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "z" &&
    node.expression.name.text === method
  );
}

function isJitlessConfigCall(node) {
  if (!isZodCall(node, "config") || node.arguments.length !== 1) return false;
  const [options] = node.arguments;
  if (!options || !ts.isObjectLiteralExpression(options)) return false;
  if (options.properties.length !== 1) return false;
  const [jitless] = options.properties;
  return (
    ts.isPropertyAssignment(jitless) &&
    (ts.isIdentifier(jitless.name) || ts.isStringLiteral(jitless.name)) &&
    jitless.name.text === "jitless" &&
    jitless.initializer.kind === ts.SyntaxKind.TrueKeyword
  );
}

function inspectSchemaSetup(schemaSource) {
  const sourceFile = ts.createSourceFile("schema.ts", schemaSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (sourceFile.parseDiagnostics.length > 0) {
    return {
      ok: false,
      message: `src/domain/validation/schema.ts could not be parsed (TypeScript syntax error).`,
    };
  }

  const configCalls = [];
  const objectCalls = [];
  const collectCalls = (node) => {
    if (ts.isCallExpression(node)) {
      if (
        isJitlessConfigCall(node) &&
        ts.isExpressionStatement(node.parent) &&
        node.parent.expression === node &&
        node.parent.parent === sourceFile
      ) {
        configCalls.push(node);
      }
      if (isZodCall(node, "object")) objectCalls.push(node);
    }
    ts.forEachChild(node, collectCalls);
  };
  collectCalls(sourceFile);

  if (configCalls.length === 0) {
    return {
      ok: false,
      message:
        "src/domain/validation/schema.ts must call z.config({ jitless: true }) at module scope before constructing its first z.object schema.",
    };
  }
  if (objectCalls.length === 0) {
    return {
      ok: false,
      message: "src/domain/validation/schema.ts contains no z.object construction to verify against jitless setup.",
    };
  }

  const firstObject = objectCalls.reduce((first, node) => (node.pos < first.pos ? node : first));
  const firstObjectLine = sourceFile.getLineAndCharacterOfPosition(firstObject.getStart(sourceFile)).line + 1;
  const earlyConfig = configCalls.find((node) => node.getStart(sourceFile) < firstObject.getStart(sourceFile));
  if (!earlyConfig) {
    return {
      ok: false,
      message: `src/domain/validation/schema.ts calls z.config({ jitless: true }) after its first z.object construction (line ${firstObjectLine}).`,
    };
  }

  return {
    ok: true,
    message: "src/domain/validation/schema.ts calls z.config({ jitless: true }) before its first z.object construction.",
  };
}

const dynamicCodePattern = /\beval\s*\(|\bnew\s+Function\s*\(|\bFunction\s*\(/g;
const aliasedFunctionConstructionPattern =
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*Function\s*;\s*new\s+\1\s*\(/g;
const zodProbeModulePattern = /(?:^|\/)node_modules\/zod\/v4\/core\/util\.[cm]?js(?:$|\?)/;
const knownZodProbePattern = /^(?:new\s+)?Function\s*\(\s*(?:``|""|'')\s*\)/;
const knownZodAliasedProbePattern =
  /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*Function\s*;\s*new\s+\1\s*\(\s*(?:""|'')\s*\)/;

/** Audit schema setup even when the emitted bundle has no dynamic-code matches. */
export function auditCsp(schemaSource, chunks) {
  const setup = inspectSchemaSetup(schemaSource);
  const errors = setup.ok ? [] : [setup.message];
  const dynamicCodeFindings = [];

  for (const { file, code, moduleIds = [] } of chunks) {
    const matches = [
      ...code.matchAll(dynamicCodePattern),
      ...code.matchAll(aliasedFunctionConstructionPattern),
    ].sort((left, right) => left.index - right.index);
    if (matches.length === 0) continue;

    const hasZodProbeModule = moduleIds.some((moduleId) => zodProbeModulePattern.test(moduleId.replaceAll("\\", "/")));
    const matchedCode = code.slice(matches[0].index);
    const isKnownProbe =
      matches.length === 1 &&
      hasZodProbeModule &&
      setup.ok &&
      (knownZodProbePattern.test(matchedCode) || knownZodAliasedProbePattern.test(matchedCode));
    if (!isKnownProbe) {
      errors.push(
        `Built JavaScript ${file} contains eval/Function code without an identified, disabled Zod CSP probe (${moduleIds.join(", ")}).`,
      );
      continue;
    }
    dynamicCodeFindings.push({ file, count: matches.length });
  }

  return { setup, errors, dynamicCodeFindings };
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
function main() {
  const errors = [];
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    consoleError(`Bundle check failed: cannot read ${relative(root, manifestPath)} (${error.message}).`);
    process.exit(1);
  }

  const allEntries = Object.entries(manifest).filter(([, chunk]) => chunk.isEntry && isJavaScript(chunk.file ?? ""));
  // Two HTML entries: the static landing page (index.html) and the editor app (app/index.html).
  // The gzip budget and forbidden-module rules apply to the editor app's initial graph;
  // the landing entry is audited separately below.
  const entries = allEntries.filter(([key, chunk]) => (chunk.src ?? key).replaceAll("\\", "/").startsWith("app/"));
  const landingEntries = allEntries.filter(([key, chunk]) => (chunk.src ?? key).replaceAll("\\", "/") === "index.html");
  failIf(entries.length === 0, "No JavaScript entry for app/index.html was found in the Vite manifest.", errors);
  failIf(landingEntries.length === 0, "No JavaScript entry for the landing index.html was found in the Vite manifest.", errors);
  // The landing's static graph may share tiny helpers (e.g. the modulepreload polyfill) but must
  // never reach React or editor code, whether in its own chunk or any statically imported one.
  const landingForbidden = /(?:^|\/)node_modules\/(?:react|react-dom|scheduler)\/|(?:^|\/)src\/(?:app|canvas|editor|inspector|palette)\//;
  const landingSeen = new Set();
  function auditLanding(key, entryKey) {
    if (landingSeen.has(key)) return;
    landingSeen.add(key);
    const chunk = manifest[key];
    if (!chunk) {
      errors.push(`Landing entry ${entryKey} references missing static import key ${key}.`);
      return;
    }
    for (const moduleId of chunk.moduleIds ?? []) {
      failIf(
        landingForbidden.test(moduleId.replaceAll("\\", "/")),
        `Landing entry ${entryKey} includes app/React module ${moduleId} (via ${key}).`,
        errors,
      );
    }
    failIf(/vendor/.test(chunk.file ?? ""), `Landing entry ${entryKey} statically imports vendor chunk ${chunk.file}.`, errors);
    for (const importedKey of chunk.imports ?? []) auditLanding(importedKey, entryKey);
  }
  for (const [key] of landingEntries) auditLanding(key, key);

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

  const schemaSource = readFileSync(join(root, "src", "domain", "validation", "schema.ts"), "utf8");
  const cspAudit = auditCsp(
    schemaSource,
    [...allJavaScriptFiles].map((file) => ({
      file,
      code: readDistFile(file).toString("utf8"),
      moduleIds: moduleIdsByFile.get(file) ?? [],
    })),
  );
  errors.push(...cspAudit.errors);
  if (cspAudit.setup.ok) log(`CSP audit: ${cspAudit.setup.message}`);

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

  for (const htmlFile of ["index.html", join("app", "index.html")]) {
    let html;
    try {
      html = readFileSync(join(dist, htmlFile), "utf8");
    } catch (error) {
      errors.push(`Cannot read built ${htmlFile} (${error.message}).`);
      continue;
    }
    for (const match of html.matchAll(/<script\b([^>]*)>/gi)) {
      if (!/\bsrc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i.test(match[1] ?? "")) {
        errors.push(`Built ${htmlFile} contains an inline script, which violates the production CSP.`);
      }
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
  if (cspAudit.dynamicCodeFindings.length) {
    for (const { file, count } of cspAudit.dynamicCodeFindings) {
      log(
        `CSP audit: ${file} contains ${count} known Zod Function probe(s); jitless mode is configured before schema construction, so the probe is skipped.`,
      );
    }
  }
}

if (isDirectRun) main();
