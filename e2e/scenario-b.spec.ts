import { expect, test } from "@playwright/test";
import { addComponent, createArchitecture } from "./helpers";

test("Scenario B — add specialized node types and distinguish an Orchestrator", async ({ page }) => {
  await page.goto("/#/");
  await createArchitecture(page, "Scenario B — Node types");

  const orchestrator = await addComponent(page, "Orchestrator", "Coordinator");
  const agent = await addComponent(page, "Agent", "Research Agent");
  const tool = await addComponent(page, "Tool", "Search Tool");
  const memory = await addComponent(page, "Memory / Data Store", "Lead Store");
  const external = await addComponent(page, "External System", "CRM");
  const decision = await addComponent(page, "Decision / Routing Rule", "Lead Router");

  await expect(orchestrator.locator(".sa-node")).toHaveAttribute("data-type", "agent");
  await expect(orchestrator.locator(".sa-node")).toHaveAttribute("data-subtype", "orchestrator");
  await expect(orchestrator.locator(".sa-node__type-label")).toHaveText("ORCHESTRATOR");
  await expect(agent.locator(".sa-node")).toHaveAttribute("data-type", "agent");
  await expect(agent.locator(".sa-node")).not.toHaveAttribute("data-subtype", "orchestrator");
  await expect(agent.locator(".sa-node__type-label")).toHaveText("AGENT");
  await expect(tool.locator(".sa-node")).toHaveAttribute("data-type", "tool");
  await expect(memory.locator(".sa-node")).toHaveAttribute("data-type", "memory");
  await expect(external.locator(".sa-node")).toHaveAttribute("data-type", "external_system");
  await expect(decision.locator(".sa-node")).toHaveAttribute("data-type", "decision");
  await expect(page.locator(".react-flow__node-component")).toHaveCount(6);
});
