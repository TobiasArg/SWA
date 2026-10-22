import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import type { NodeResult, Result } from "axe-core";
import { axeExclusions } from "./axe-exclusions";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

export interface A11yScanOptions {
  /** Limit the scan to one or more CSS selectors. By default axe scans the whole page. */
  include?: string | readonly string[];
  /** Omit one or more CSS selector subtrees from this scan. */
  exclude?: string | readonly string[];
}

function selectors(value: string | readonly string[] | undefined): readonly string[] {
  return value === undefined ? [] : typeof value === "string" ? [value] : value;
}

async function isCoveredByExclusion(page: Page, node: NodeResult, selector: string): Promise<boolean> {
  for (const target of node.target) {
    if (typeof target !== "string") continue;
    const covered = await page.locator(target).evaluateAll(
      (elements, excludedSelector) =>
        elements.some((element) => element.matches(excludedSelector) || element.closest(excludedSelector) !== null),
      selector,
    );
    if (covered) return true;
  }
  return false;
}

function formatViolation(rule: Result, nodes: readonly NodeResult[]): string {
  const targets = nodes.flatMap((node) => node.target.map((target) => `    ${JSON.stringify(target)}`));
  return [
    `- ${rule.id} (impact: ${rule.impact ?? "unknown"})`,
    `  ${rule.help}`,
    `  Help: ${rule.helpUrl}`,
    "  Target:",
    ...(targets.length ? targets : ["    (no target reported)"]),
  ].join("\n");
}

/** Run the WCAG 2.0/2.1/2.2 A/AA rules; all unexcluded violations fail with actionable targets. */
export async function expectNoA11yViolations(page: Page, options: A11yScanOptions = {}): Promise<void> {
  const axe = new AxeBuilder({ page }).withTags(WCAG_TAGS);
  for (const selector of selectors(options.include)) axe.include(selector);
  for (const selector of selectors(options.exclude)) axe.exclude(selector);

  const results = await axe.analyze();
  const violations: string[] = [];
  for (const rule of results.violations) {
    const ruleExclusions = axeExclusions.filter((entry) => entry.rule === rule.id);
    const remainingNodes: NodeResult[] = [];
    for (const node of rule.nodes) {
      const excluded = await Promise.all(
        ruleExclusions.map((entry) => isCoveredByExclusion(page, node, entry.selector)),
      );
      if (!excluded.some(Boolean)) remainingNodes.push(node);
    }
    if (remainingNodes.length > 0) violations.push(formatViolation(rule, remainingNodes));
  }

  expect(
    violations,
    violations.length
      ? `Accessibility violations on ${page.url()} (WCAG 2.0/2.1/2.2 A/AA):\n${violations.join("\n")}`
      : `Expected no WCAG 2.0/2.1/2.2 A/AA violations on ${page.url()}`,
  ).toEqual([]);
}
