import { z } from "zod";
import { SCHEMA_VERSION } from "../types";
import {
  limitExceededCountIssue,
  limitExceededTextIssue,
  shapeIssue,
  type ValidationIssue,
  type ValidationResult,
} from "./issues";

export const MAX_COMPONENTS = 1_000;
export const MAX_RELATIONSHIPS = 3_000;
export const MAX_GROUPS = 200;
export const MAX_LINKS_PER_COMPONENT = 100;
export const MAX_BEHAVIOR_LIST_ITEMS = 500;
export const MAX_TEXT_LENGTH = 50_000;
export const MAX_ID_LENGTH = 200;

const limitMarker = (kind: "text" | "count", maximum: number): string =>
  `__limit_${kind}_${maximum}__`;

const text = (maximum = MAX_TEXT_LENGTH) =>
  z.string().max(maximum, limitMarker("text", maximum));
const nonBlankText = () =>
  text().refine((value) => value.trim().length > 0, "expected a non-empty text value.");
const idSchema = z.string().min(1, "expected a non-empty text value.").max(
  MAX_ID_LENGTH,
  limitMarker("text", MAX_ID_LENGTH),
);
const boundedArray = <T extends z.ZodType>(item: T, maximum: number) =>
  z.array(item).max(maximum, limitMarker("count", maximum));
const finiteNumber = () => z.number().refine(Number.isFinite, "expected a finite number.");
const positiveNumber = () => finiteNumber().refine((value) => value > 0, "expected a number greater than 0.");
const nonNegativeNumber = () =>
  finiteNumber().refine((value) => value >= 0, "expected a number greater than or equal to 0.");

const positionSchema = z.object({ x: finiteNumber(), y: finiteNumber() });
const sizeSchema = z.object({ width: positiveNumber(), height: positiveNumber() });
const boundsSchema = z.object({
  x: finiteNumber(),
  y: finiteNumber(),
  width: nonNegativeNumber(),
  height: nonNegativeNumber(),
});
const viewportSchema = z.object({
  x: finiteNumber(),
  y: finiteNumber(),
  zoom: positiveNumber(),
});

const timestampSchema = text().refine(
  (value) => /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)),
  "expected a valid ISO 8601 timestamp.",
);

const behaviorSchema = z.object({
  purpose: text().optional(),
  role: text().optional(),
  responsibilities: boundedArray(text(), MAX_BEHAVIOR_LIST_ITEMS).optional(),
  boundaries: boundedArray(text(), MAX_BEHAVIOR_LIST_ITEMS).optional(),
  activation: text().optional(),
  rules: boundedArray(text(), MAX_BEHAVIOR_LIST_ITEMS).optional(),
  delegation: text().optional(),
  outputs: text().optional(),
  failureHandling: text().optional(),
});

const componentSchema = z.object({
  id: idSchema,
  type: z.enum(["agent", "tool", "memory", "external_system", "decision"]),
  // Kept as a string here so semantic validation can issue E_INVALID_SUBTYPE.
  subtype: text().optional(),
  name: nonBlankText(),
  description: text().optional(),
  notes: text().optional(),
  links: boundedArray(
    z.object({ label: text().optional(), url: text() }),
    MAX_LINKS_PER_COMPONENT,
  ).optional(),
  position: positionSchema,
  size: sizeSchema.optional(),
  // Kept as a string here so semantic validation can issue E_INVALID_ACCENT.
  accent: text(64).optional(),
  properties: z.record(z.string().max(MAX_TEXT_LENGTH, limitMarker("text", MAX_TEXT_LENGTH)), text()).optional(),
  behavior: behaviorSchema.optional(),
});

const relationshipTypes = [
  "delegates_to",
  "supervises",
  "uses",
  "reads_from",
  "writes_to",
  "shares_context_with",
  "reports_to",
  "hands_off_to",
  "depends_on",
  "generic",
] as const;

const relationshipSchema = z.object({
  id: idSchema,
  type: z.enum(relationshipTypes),
  sourceId: idSchema,
  targetId: idSchema,
  direction: z.enum(["directed", "undirected"]),
  label: text().optional(),
  description: text().optional(),
  // visual is intentionally open-ended and preserved verbatim.
  visual: z.record(
    z.string().max(MAX_TEXT_LENGTH, limitMarker("text", MAX_TEXT_LENGTH)),
    z.unknown(),
  ).superRefine((value, context) => {
    const inspect = (child: unknown, path: PropertyKey[]): void => {
      if (typeof child === "string" && child.length > MAX_TEXT_LENGTH) {
        context.addIssue({
          code: "custom",
          path,
          message: limitMarker("text", MAX_TEXT_LENGTH),
        });
      } else if (Array.isArray(child)) {
        child.forEach((entry, index) => inspect(entry, [...path, index]));
      } else if (child !== null && typeof child === "object") {
        for (const [key, entry] of Object.entries(child)) {
          inspect(entry, [...path, key]);
        }
      }
    };

    for (const [key, child] of Object.entries(value)) inspect(child, [key]);
  }).optional(),
});

const groupSchema = z.object({
  id: idSchema,
  name: nonBlankText(),
  description: text().optional(),
  notes: text().optional(),
  memberComponentIds: boundedArray(idSchema, MAX_COMPONENTS),
  bounds: boundsSchema,
});

const architectureSchema = z.object({
  id: idSchema,
  name: nonBlankText(),
  description: text().optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  components: boundedArray(componentSchema, MAX_COMPONENTS),
  relationships: boundedArray(relationshipSchema, MAX_RELATIONSHIPS),
  groups: boundedArray(groupSchema, MAX_GROUPS),
  canvas: z.object({ viewport: viewportSchema.optional() }).optional(),
});

/**
 * Zod objects intentionally use their default unknown-key stripping behavior;
 * only `properties` and relationship `visual` preserve arbitrary keys.
 */
export const architectureFileSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  architecture: architectureSchema,
});

function formatPath(path: PropertyKey[]): string {
  return path.reduce<string>((result, part) => {
    if (typeof part === "number") return `${result}[${part}]`;
    if (typeof part === "symbol") return `${result}[${String(part)}]`;
    return result ? `${result}.${part}` : part;
  }, "");
}

function readAtPath(raw: unknown, path: PropertyKey[]): unknown {
  let value = raw;
  for (const part of path) {
    if (value === null || typeof value !== "object") return undefined;
    value = (value as Record<PropertyKey, unknown>)[part];
  }
  return value;
}

function convertShapeIssue(issue: z.core.$ZodIssue, raw: unknown): ValidationIssue {
  const path = formatPath(issue.path);
  const marker = /^__limit_(text|count)_(\d+)__$/.exec(issue.message);
  if (marker) {
    const maximum = Number(marker[2]);
    const value = readAtPath(raw, issue.path);
    if (marker[1] === "count") {
      return limitExceededCountIssue(path, Array.isArray(value) ? value.length : 0, maximum);
    }
    return limitExceededTextIssue(path, maximum);
  }
  return shapeIssue(path, issue.message);
}

export function parseArchitectureShape(raw: unknown): ValidationResult<z.infer<typeof architectureFileSchema>> {
  const parsed = architectureFileSchema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, issues: parsed.error.issues.map((issue) => convertShapeIssue(issue, raw)) };
}
