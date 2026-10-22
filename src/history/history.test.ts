import { describe, expect, it } from "vitest";
import { HISTORY_LIMIT, breakCoalescing, createHistory, head, push, redo, undo } from "./history";
import type { Architecture } from "../domain/types";

function architecture(name: string): Architecture {
  return {
    id: "arch_test",
    name,
    createdAt: "2026-10-21T00:00:00Z",
    updatedAt: "2026-10-21T00:00:00Z",
    components: [],
    relationships: [],
    groups: [],
  };
}

let nextId = 0;

function entry(before: string, after: string, coalesceKey?: string) {
  nextId += 1;
  return {
    id: nextId,
    before: architecture(before),
    after: architecture(after),
    ...(coalesceKey === undefined ? {} : { coalesceKey }),
    label: `change ${after}`,
  };
}

describe("snapshot history", () => {
  it("starts empty and returns null when no undo/redo is available", () => {
    const history = createHistory();
    expect(history).toEqual({ past: [], future: [] });
    expect(undo(history)).toBeNull();
    expect(redo(history)).toBeNull();
    expect(breakCoalescing(history)).toBe(history);
  });

  it("merges consecutive matching keys, keeping the first before and last after snapshots", () => {
    const first = push(createHistory(), entry("A", "B", "cmp_1:name"));
    const merged = push(first, entry("B", "C", "cmp_1:name"));

    expect(merged.past).toHaveLength(1);
    expect(merged.past[0]).toMatchObject({
      before: architecture("A"),
      after: architecture("C"),
      label: "change B",
      coalesceKey: "cmp_1:name",
    });
    expect(merged.openCoalesceKey).toBe("cmp_1:name");
  });

  it("breaks coalescing for an absent or different key and clears the redo branch", () => {
    let history = push(createHistory(), entry("A", "B", "field"));
    history = push(history, entry("B", "C"));
    expect(history.past).toHaveLength(2);
    expect(history.openCoalesceKey).toBeUndefined();

    const afterUndo = undo(history);
    expect(afterUndo?.architecture.name).toBe("B");
    const branched = push(afterUndo!.history, entry("B", "D", "other"));
    expect(branched.future).toEqual([]);
    expect(branched.past).toHaveLength(2);

    const changedKey = push(push(createHistory(), entry("A", "B", "one")), entry("B", "C", "two"));
    expect(changedKey.past).toHaveLength(2);
  });

  it("undoes and redoes snapshots while breaking the open coalescing window", () => {
    const history = push(createHistory(), entry("A", "B", "field"));
    const undone = undo(history)!;
    expect(undone.architecture).toEqual(architecture("A"));
    expect(undone.history.openCoalesceKey).toBeUndefined();
    expect(undone.history.future).toHaveLength(1);

    const redone = redo(undone.history)!;
    expect(redone.architecture).toEqual(architecture("B"));
    expect(redone.history.past).toHaveLength(1);
    expect(redone.history.future).toEqual([]);
    expect(redone.history.openCoalesceKey).toBeUndefined();
  });

  it("caps past history at 200 entries, dropping the oldest", () => {
    let history = createHistory();
    for (let index = 0; index < HISTORY_LIMIT + 5; index += 1) {
      history = push(history, entry(`before-${index}`, `after-${index}`));
    }

    expect(history.past).toHaveLength(HISTORY_LIMIT);
    expect(history.past[0]?.before.name).toBe("before-5");
    expect(history.past.at(-1)?.after.name).toBe(`after-${HISTORY_LIMIT + 4}`);
  });

  it("keeps entry ids through undo, redo and coalescing, and exposes the top entry", () => {
    expect(head(createHistory())).toBeUndefined();

    const first = entry("A", "B", "field");
    const merged = push(push(createHistory(), first), entry("B", "C", "field"));
    expect(merged.past).toHaveLength(1);
    expect(head(merged)?.id).toBe(first.id);

    const second = entry("C", "D");
    const history = push(merged, second);
    expect(head(history)?.id).toBe(second.id);

    const undone = undo(history)!;
    expect(head(undone.history)?.id).toBe(first.id);
    expect(undone.history.future[0]?.id).toBe(second.id);

    const redone = redo(undone.history)!;
    expect(redone.history.past.map((item) => item.id)).toEqual([first.id, second.id]);
    expect(head(redone.history)?.id).toBe(second.id);
  });
});
