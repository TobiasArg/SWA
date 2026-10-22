import { describe, expect, it } from "vitest";
import type { Architecture, Component, Group } from "../domain/types";
import { searchComponents } from "./search";

function component(id: string, name: string, type: Component["type"] = "agent"): Component {
  return { id, name, type, position: { x: 0, y: 0 } };
}

function architecture(components: Component[], groups: Group[] = []): Architecture {
  return {
    id: "arch", name: "Diagram", createdAt: "2026-10-22", updatedAt: "2026-10-22",
    components, groups, relationships: [],
  };
}

function group(name: string, memberComponentIds: string[]): Group {
  return { id: "group", name, memberComponentIds, bounds: { x: 0, y: 0, width: 100, height: 100 } };
}

describe("searchComponents (QF1)", () => {
  it("ranks exact, prefix, word-prefix, substring, then type/group matches", () => {
    const input = architecture([
      component("type", "A type-only match", "tool"),
      component("substring", "Attoolbox"),
      component("word", "My tool kit"),
      component("prefix", "Toolbox"),
      component("exact", "Tool"),
      component("group", "B grouped match"),
      component("none", "Unrelated"),
    ], [group("Tool collection", ["group"])]);
    expect(searchComponents(input, "tool").results.map(({ component }) => component.id))
      .toEqual(["exact", "prefix", "word", "substring", "type", "group"]);
  });

  it("sorts tied matches by locale name, then ID, independently of component order", () => {
    const components = [component("b", "Same"), component("a", "Same"), component("z", "Álpha")];
    const expected = [...components].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    for (const input of [components, [...components].reverse()]) {
      expect(searchComponents(architecture(input), "").results.map(({ component }) => component))
        .toEqual(expected);
    }
  });

  it("matches case and diacritics and maps all name ranges to original UTF-16 offsets", () => {
    const input = architecture([component("c", "😀 Crème cre\u0300me CRÈME")]);
    const result = searchComponents(input, "  cReMe  ").results[0]!;
    expect(result.ranges).toEqual([[3, 8], [9, 15], [16, 21]]);
    expect(result.ranges.map(([start, end]) => result.component.name.slice(start, end)))
      .toEqual(["Crème", "cre\u0300me", "CRÈME"]);
    expect(searchComponents(input, "CRÈME")).toEqual(searchComponents(input, "creme"));
  });

  it("includes trailing combining marks in highlights and handles contextual lowercasing", () => {
    expect(searchComponents(architecture([component("c", "Cafe\u0301")]), "cafe").results[0]!.ranges)
      .toEqual([[0, 5]]);
    expect(searchComponents(architecture([component("c", "ΟΣ")]), "ος").total).toBe(1);
  });

  it("recognizes punctuation and Unicode word boundaries ahead of interior substrings", () => {
    const input = architecture([
      component("inside", "Acreme"), component("dash", "Z-crème"), component("unicode", "Écrème"),
    ]);
    expect(searchComponents(input, "creme").results.map(({ component }) => component.id))
      .toEqual(["dash", "inside", "unicode"]);
  });

  it("searches canonical type labels, not raw type keys", () => {
    const input = architecture([
      component("external", "Outside", "external_system"),
      component("memory", "Cache", "memory"),
      component("decision", "Switch", "decision"),
    ]);
    for (const [query, id] of [["EXTERNAL SYSTEM", "external"], ["data store", "memory"], ["routing rule", "decision"]] as const) {
      const result = searchComponents(input, query);
      expect(result.total).toBe(1);
      expect(result.results[0]!.component.id).toBe(id);
      expect(result.results[0]!.ranges).toEqual([]);
    }
    expect(searchComponents(input, "external_system").total).toBe(0);
  });

  it("returns group names for members and matches normalized group names", () => {
    const input = architecture([component("member", "Worker"), component("alone", "Solo")],
      [group("Crème team", ["member"])]);
    expect(searchComponents(input, "CREME")).toEqual({
      results: [{ component: input.components[0], groupName: "Crème team", ranges: [] }], total: 1,
    });
    expect(searchComponents(input, "worker").results[0]!.groupName).toBe("Crème team");
    expect(searchComponents(input, "solo").results[0]).not.toHaveProperty("groupName");
  });

  it("defaults to 50 results while counting every match and supports explicit limits", () => {
    const input = architecture(Array.from({ length: 65 }, (_, index) => component(`${index}`, `Worker ${index}`)));
    expect(searchComponents(input, "worker").results).toHaveLength(50);
    expect(searchComponents(input, "worker").total).toBe(65);
    expect(searchComponents(input, "worker", 2).results).toHaveLength(2);
    expect(searchComponents(input, "worker", 0)).toEqual({ results: [], total: 65 });
    expect(searchComponents(input, "worker", -1)).toEqual({ results: [], total: 65 });
    expect(searchComponents(input, "worker", 100).results).toHaveLength(65);
    expect(searchComponents(input, "missing")).toEqual({ results: [], total: 0 });
    expect(searchComponents(architecture([]), "")).toEqual({ results: [], total: 0 });
    expect(searchComponents(input, "   ").results.every(({ ranges }) => ranges.length === 0)).toBe(true);
  });

  it("does not mutate input or use relationships or geometry to match or rank", () => {
    const input = architecture([component("b", "Beta"), component("a", "Alpha")], [group("Team", ["a"])]);
    input.relationships = [
      { id: "r1", type: "uses", sourceId: "a", targetId: "b", direction: "directed" },
      { id: "r2", type: "supervises", sourceId: "b", targetId: "a", direction: "directed" },
    ];
    const before = structuredClone(input);
    const expected = searchComponents(input, "");
    expect(input).toEqual(before);
    expect(searchComponents({ ...input, relationships: [...input.relationships].reverse() }, ""))
      .toEqual(expected);
    Object.defineProperty(input, "relationships", { get() { throw new Error("graph read"); } });
    for (const item of input.components) {
      Object.defineProperty(item, "position", { get() { throw new Error("position read"); } });
    }
    Object.defineProperty(input.groups[0], "bounds", { get() { throw new Error("bounds read"); } });
    expect(searchComponents(input, "").results.map(({ component }) => component.id)).toEqual(["a", "b"]);
    expect(searchComponents(input, "team").results.map(({ component }) => component.id)).toEqual(["a"]);
  });
});
