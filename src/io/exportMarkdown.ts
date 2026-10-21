import { COMPONENT_TYPE_LABELS, RELATIONSHIP_TYPES } from "../domain/constants";
import type { AgentBehavior, Architecture, Component, ComponentType, Group, Relationship } from "../domain/types";
import { isSafeLink } from "../ui/safeLink";
import { download } from "./download";
import { slugifyArchitectureName } from "./exportJson";

/*
 * Deterministic Markdown export of a full architecture.
 *
 * Ordering rule: groups, components and relationships are sorted by a
 * codepoint comparison of their display name (relationships: source name,
 * target name, relationship verb, custom label), tie-broken by id. List
 * members are sorted the same way. Property keys follow the inspector's
 * field order for the component type, then unknown keys sorted by codepoint.
 * Volatile data (timestamps, canvas geometry) is never emitted.
 *
 * Escaping: single-line fields are whitespace-collapsed and have Markdown /
 * HTML-significant characters backslash-escaped. Multi-line plain fields are
 * escaped per line (also neutralising leading list/heading/quote markers).
 * Component and group notes are user Markdown and are embedded verbatim.
 */

export function architectureMarkdownFilename(name: string): string {
  return `${slugifyArchitectureName(name) || "architecture"}.md`;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function present(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== "";
}

const INLINE_SPECIAL = /[\\`*_[\]<>&|~#]/g;

/** Single-line inline text safe from injecting Markdown structure. */
function inline(value: string): string {
  return value.replace(/\s+/g, " ").trim().replace(INLINE_SPECIAL, "\\$&");
}

/** Multi-line plain text, escaped per line so it stays a plain paragraph. */
function block(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .trim()
    .split("\n")
    .map((line) => {
      const escaped = line.trimEnd().replace(INLINE_SPECIAL, "\\$&");
      return escaped.replace(/^(\s*)([-+=]|\d+(?=[.)]))/, "$1\\$2");
    })
    .join("\n");
}

function codeSpan(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  const runs = text.match(/`+/g) ?? [];
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 0);
  const fence = "`".repeat(longest + 1);
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return `${fence}${pad}${text}${pad}${fence}`;
}

function indent(value: string, prefix: string): string {
  return value
    .split("\n")
    .map((line, index) => (index === 0 || line === "" ? line : prefix + line))
    .join("\n");
}

function link(label: string | undefined, url: string): string {
  const trimmed = url.trim();
  if (!isSafeLink(trimmed)) {
    return present(label) ? `${inline(label)}: ${codeSpan(trimmed)}` : codeSpan(trimmed);
  }
  const dest = trimmed.replace(/[<>\s]/g, (ch) => encodeURIComponent(ch));
  return `[${present(label) ? inline(label) : inline(trimmed)}](<${dest}>)`;
}

const displayName = (item: { name: string }): string => (present(item.name) ? inline(item.name) : "Untitled");
const byNameThenId = (a: { name: string; id: string }, b: { name: string; id: string }): number =>
  cmp(a.name, b.name) || cmp(a.id, b.id);

/** A labelled field: one-liners inline, multi-line values as a paragraph below. */
function field(label: string, value: string | undefined): string | null {
  if (!present(value)) return null;
  const text = block(value);
  return text.includes("\n") ? `**${label}**\n\n${text}` : `**${label}:** ${text}`;
}

function listField(label: string, values: string[] | undefined): string | null {
  const items = (values ?? []).filter(present).map((item) => `- ${inline(item)}`);
  return items.length > 0 ? `**${label}**\n\n${items.join("\n")}` : null;
}

/** Closes a code fence left open by user notes so it cannot swallow later sections. */
function closeOpenFence(markdown: string): string {
  let open: string | null = null;
  for (const line of markdown.split("\n")) {
    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (!fence) continue;
    if (open === null) open = fence;
    else if (fence[0] === open[0] && fence.length >= open.length && line.trim() === fence) open = null;
  }
  return open === null ? markdown : `${markdown}\n${open}`;
}

function notesField(notes: string | undefined): string | null {
  if (!present(notes)) return null;
  return `**Notes**\n\n${closeOpenFence(notes.replace(/\r\n?/g, "\n").trim())}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const PROPERTY_FIELDS: Record<ComponentType, ReadonlyArray<readonly [string, string]>> = {
  agent: [],
  tool: [
    ["inputs", "Inputs"],
    ["outputs", "Outputs"],
    ["technicalReference", "Technical reference"],
  ],
  memory: [
    ["storeKind", "Store kind"],
    ["accessScope", "Access scope"],
    ["contents", "Contents"],
    ["accessNotes", "Access notes"],
  ],
  external_system: [
    ["systemKind", "System kind"],
    ["boundaryNotes", "Boundary / ownership notes"],
    ["referenceLink", "Reference link"],
  ],
  decision: [
    ["condition", "Condition"],
    ["outcomes", "Outcomes"],
  ],
};

function propertyBlocks(component: Component): string[] {
  const properties = component.properties ?? {};
  const known = PROPERTY_FIELDS[component.type];
  const knownKeys = new Set(known.map(([key]) => key));
  const entries: Array<[string, string]> = [
    ...known.map(([key, label]) => [key, label] as [string, string]),
    ...Object.keys(properties)
      .filter((key) => !knownKeys.has(key))
      .sort(cmp)
      .map((key) => [key, key] as [string, string]),
  ];
  const out: string[] = [];
  for (const [key, label] of entries) {
    const value = properties[key];
    if (!present(value)) continue;
    if (key === "referenceLink" && component.type === "external_system") {
      out.push(`**${label}:** ${link(undefined, value)}`);
    } else if (key === "storeKind" || key === "accessScope") {
      out.push(`**${label}:** ${inline(capitalize(value.trim()))}`);
    } else {
      out.push(field(inline(label), value) as string);
    }
  }
  return out;
}

function behaviorBlocks(behavior: AgentBehavior | undefined): string[] {
  if (!behavior) return [];
  return [
    field("Purpose", behavior.purpose),
    field("Role", behavior.role),
    listField("Responsibilities", behavior.responsibilities),
    listField("Boundaries", behavior.boundaries),
    field("Activation", behavior.activation),
    listField("Behavioral rules", behavior.rules),
    field("Delegation", behavior.delegation),
    field("Outputs", behavior.outputs),
    field("Failure handling", behavior.failureHandling),
  ].filter((part): part is string => part !== null);
}

function linkBlock(links: Component["links"]): string | null {
  const items = (links ?? []).filter((item) => present(item.url)).map((item) => `- ${link(item.label, item.url)}`);
  return items.length > 0 ? `**Links**\n\n${items.join("\n")}` : null;
}

function componentSection(component: Component, groupsByComponent: Map<string, Group[]>): string {
  const typeLabel = COMPONENT_TYPE_LABELS[component.type] ?? inline(String(component.type));
  const type = component.subtype === "orchestrator" ? `${typeLabel} (Orchestrator)` : typeLabel;
  const memberOf = (groupsByComponent.get(component.id) ?? []).map(displayName);
  const parts = [
    `### ${displayName(component)}`,
    `**Type:** ${type}`,
    memberOf.length > 0 ? `**Groups:** ${memberOf.join(", ")}` : null,
    field("Description", component.description),
    ...behaviorBlocks(component.behavior),
    ...propertyBlocks(component),
    linkBlock(component.links),
    notesField(component.notes),
  ];
  return parts.filter((part): part is string => part !== null).join("\n\n");
}

function groupSection(group: Group, componentsById: Map<string, Component>): string {
  const members = group.memberComponentIds
    .map((id) => componentsById.get(id))
    .filter((c): c is Component => c !== undefined)
    .sort(byNameThenId)
    .map((c) => `- ${displayName(c)} (${COMPONENT_TYPE_LABELS[c.type]})`);
  const parts = [
    `### ${displayName(group)}`,
    field("Description", group.description),
    members.length > 0 ? `**Members**\n\n${members.join("\n")}` : null,
    notesField(group.notes),
  ];
  return parts.filter((part): part is string => part !== null).join("\n\n");
}

function relationshipItem(rel: Relationship, componentsById: Map<string, Component>): string {
  const name = (id: string): string => {
    const c = componentsById.get(id);
    return c ? `**${displayName(c)}**` : `${codeSpan(id)} (missing component)`;
  };
  const info = RELATIONSHIP_TYPES[rel.type];
  const verb = info ? info.verb : inline(String(rel.type));
  const arrow = rel.direction === "undirected" ? "—" : "→";
  const lines = [`- ${name(rel.sourceId)} ${arrow} ${verb} ${arrow} ${name(rel.targetId)}`];
  if (present(rel.label)) lines.push(`  - Label: ${inline(rel.label)}`);
  if (present(rel.description)) lines.push(`  - Description: ${indent(block(rel.description), "    ")}`);
  return lines.join("\n");
}

export function exportArchitectureMarkdown(architecture: Architecture): string {
  const components = [...architecture.components].sort(byNameThenId);
  const groups = [...architecture.groups].sort(byNameThenId);
  const componentsById = new Map(components.map((c) => [c.id, c]));

  const groupsByComponent = new Map<string, Group[]>();
  for (const group of groups) {
    for (const id of new Set(group.memberComponentIds)) {
      groupsByComponent.set(id, [...(groupsByComponent.get(id) ?? []), group]);
    }
  }

  const nameOf = (id: string): string => componentsById.get(id)?.name ?? id;
  const relationships = [...architecture.relationships].sort(
    (a, b) =>
      cmp(nameOf(a.sourceId), nameOf(b.sourceId)) ||
      cmp(nameOf(a.targetId), nameOf(b.targetId)) ||
      cmp(a.type, b.type) ||
      cmp(a.label ?? "", b.label ?? "") ||
      cmp(a.id, b.id),
  );

  const sections: string[] = [`# ${displayName(architecture)}`];
  if (present(architecture.description)) sections.push(block(architecture.description));

  const typeCounts = (Object.keys(COMPONENT_TYPE_LABELS) as ComponentType[])
    .map((type) => [type, components.filter((c) => c.type === type).length] as const)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `${COMPONENT_TYPE_LABELS[type]}: ${count}`);
  sections.push(
    [
      "## Summary",
      [
        `- Components: ${components.length}${typeCounts.length > 0 ? ` (${typeCounts.join(", ")})` : ""}`,
        `- Groups: ${groups.length}`,
        `- Relationships: ${relationships.length}`,
      ].join("\n"),
    ].join("\n\n"),
  );

  if (groups.length > 0) {
    const grouped = new Set(groups.flatMap((g) => g.memberComponentIds));
    const ungrouped = components.filter((c) => !grouped.has(c.id));
    const parts = ["## Groups", ...groups.map((g) => groupSection(g, componentsById))];
    if (ungrouped.length > 0) {
      parts.push(
        `### Ungrouped\n\n${ungrouped.map((c) => `- ${displayName(c)} (${COMPONENT_TYPE_LABELS[c.type]})`).join("\n")}`,
      );
    }
    sections.push(parts.join("\n\n"));
  }

  if (components.length > 0) {
    sections.push(
      ["## Components", ...components.map((c) => componentSection(c, groupsByComponent))].join("\n\n"),
    );
  }

  if (relationships.length > 0) {
    sections.push(
      [
        "## Relationships",
        "> Relationships are semantic documentation of how components relate. They do not represent execution order, control flow, or data flow.",
        relationships.map((r) => relationshipItem(r, componentsById)).join("\n"),
      ].join("\n\n"),
    );
  }

  return `${sections.join("\n\n")}\n`;
}

export function downloadArchitectureMarkdown(architecture: Architecture): void {
  download(
    new Blob([exportArchitectureMarkdown(architecture)], { type: "text/markdown;charset=utf-8" }),
    architectureMarkdownFilename(architecture.name),
  );
}
