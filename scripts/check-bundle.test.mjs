import assert from "node:assert/strict";
import test from "node:test";
import { auditCsp } from "./check-bundle.mjs";

const zodModule = "node_modules/zod/v4/core/util.js";
const validSchema = `
import { z } from "zod";
z.config({ jitless: true });
const schema = z.object({});
`;

test("accepts real module-scope jitless setup before the first z.object", () => {
  const result = auditCsp(validSchema, []);

  assert.equal(result.setup.ok, true);
  assert.match(result.setup.message, /before its first z\.object construction/);
  assert.deepEqual(result.errors, []);
});

test("fails missing and late jitless setup without requiring a bundle match", () => {
  const missing = auditCsp('import { z } from "zod";\nconst schema = z.object({});', []);
  const late = auditCsp('import { z } from "zod";\nconst schema = z.object({});\nz.config({ jitless: true });', []);

  assert.equal(missing.setup.ok, false);
  assert.match(missing.errors[0], /must call z\.config/);
  assert.equal(late.setup.ok, false);
  assert.match(late.errors[0], /after its first z\.object construction/);
});

test("requires jitless setup to be unconditional and rejects duplicate config keys", () => {
  const conditional = auditCsp(
    'if (true) { z.config({ jitless: true }); }\nconst schema = z.object({});',
    [],
  );
  const duplicateKey = auditCsp(
    'z.config({ jitless: true, "jitless": false });\nconst schema = z.object({});',
    [],
  );

  assert.equal(conditional.setup.ok, false);
  assert.equal(duplicateKey.setup.ok, false);
});

test("comments and strings cannot impersonate the setup call", () => {
  const source = `
import { z } from "zod";
// z.config({ jitless: true });
const note = "z.config({ jitless: true })";
const schema = z.object({});
`;
  const result = auditCsp(source, []);

  assert.equal(result.setup.ok, false);
  assert.match(result.errors[0], /must call z\.config/);
});

test("rejects unrelated eval and Function calls even when the chunk has the Zod module ID", () => {
  const evalResult = auditCsp(validSchema, [
    { file: "eval.js", code: 'eval("alert(1)")', moduleIds: [zodModule] },
  ]);
  const functionResult = auditCsp(validSchema, [
    { file: "function.js", code: 'Function("return 1")()', moduleIds: [zodModule] },
  ]);
  const newFunctionResult = auditCsp(validSchema, [
    { file: "function.js", code: 'new Function("return 1")', moduleIds: [zodModule] },
  ]);
  const aliasedFunctionResult = auditCsp(validSchema, [
    { file: "function.js", code: 'const F = Function; new F("return 1");', moduleIds: [zodModule] },
  ]);

  assert.match(evalResult.errors.join("\n"), /eval\/Function code/);
  assert.match(functionResult.errors.join("\n"), /eval\/Function code/);
  assert.match(newFunctionResult.errors.join("\n"), /eval\/Function code/);
  assert.match(aliasedFunctionResult.errors.join("\n"), /eval\/Function code/);
  assert.deepEqual(evalResult.dynamicCodeFindings, []);
  assert.deepEqual(functionResult.dynamicCodeFindings, []);
  assert.deepEqual(newFunctionResult.dynamicCodeFindings, []);
  assert.deepEqual(aliasedFunctionResult.dynamicCodeFindings, []);
});

test("allows the known empty Function probes only with jitless setup and their Zod module ID", () => {
  const emittedProbe =
    "if(I.jitless||typeof navigator<`u`&&navigator?.userAgent?.includes(`Cloudflare`))return!1;try{return Function(``),!0}catch{return!1}})";
  const probe = { file: "zod.js", code: emittedProbe, moduleIds: [zodModule] };
  const noModuleId = auditCsp(validSchema, [{ ...probe, moduleIds: ["src/domain/validation/schema.ts"] }]);
  const aliasedProbe = { file: "zod.js", code: 'const F = Function; new F("");', moduleIds: [zodModule] };
  const allowedAliasedProbe = auditCsp(validSchema, [aliasedProbe]);
  const allowedForms = [
    'Function("")',
    "Function('')",
    'new Function("")',
    "new Function('')",
  ].map((code) => auditCsp(validSchema, [{ file: "zod.js", code, moduleIds: [zodModule] }]));
  const allowed = auditCsp(validSchema, [probe]);

  assert.deepEqual(allowed.errors, []);
  assert.deepEqual(allowed.dynamicCodeFindings, [{ file: "zod.js", count: 1 }]);
  assert.deepEqual(allowedAliasedProbe.errors, []);
  assert.deepEqual(allowedAliasedProbe.dynamicCodeFindings, [{ file: "zod.js", count: 1 }]);
  for (const result of allowedForms) {
    assert.deepEqual(result.errors, []);
    assert.equal(result.dynamicCodeFindings.length, 1);
  }
  assert.match(noModuleId.errors.join("\n"), /eval\/Function code/);
  assert.deepEqual(noModuleId.dynamicCodeFindings, []);
});

test("rejects multiple dynamic-code matches in a chunk even when one matches the probe", () => {
  const result = auditCsp(validSchema, [
    { file: "zod.js", code: 'Function(``), Function("")', moduleIds: [zodModule] },
  ]);

  assert.match(result.errors.join("\n"), /eval\/Function code/);
  assert.deepEqual(result.dynamicCodeFindings, []);
});

test("does not allow the known probe when jitless setup is missing", () => {
  const result = auditCsp('import { z } from "zod";\nconst schema = z.object({});', [
    { file: "zod.js", code: 'new Function( "" )', moduleIds: [zodModule] },
  ]);

  assert.equal(result.setup.ok, false);
  assert.equal(result.errors.length, 2);
});
