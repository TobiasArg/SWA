import type { Architecture } from "../domain/types";

export interface HistoryEntry {
  before: Architecture;
  after: Architecture;
  coalesceKey?: string;
  label: string;
}

export interface History {
  past: HistoryEntry[];
  future: HistoryEntry[];
  openCoalesceKey?: string;
}

export const HISTORY_LIMIT = 200;

export function createHistory(): History {
  return { past: [], future: [] };
}

export function push(history: History, entry: HistoryEntry): History {
  const canMerge =
    entry.coalesceKey !== undefined &&
    entry.coalesceKey === history.openCoalesceKey &&
    history.past.length > 0;

  let past: HistoryEntry[];
  if (canMerge) {
    const previous = history.past[history.past.length - 1];
    if (!previous) return history;
    past = [
      ...history.past.slice(0, -1),
      { ...previous, after: entry.after },
    ];
  } else {
    past = [...history.past, entry];
  }

  if (past.length > HISTORY_LIMIT) past = past.slice(past.length - HISTORY_LIMIT);
  return {
    past,
    future: [],
    ...(entry.coalesceKey === undefined ? {} : { openCoalesceKey: entry.coalesceKey }),
  };
}

export function undo(
  history: History,
): { history: History; architecture: Architecture } | null {
  const entry = history.past[history.past.length - 1];
  if (!entry) return null;

  return {
    history: {
      past: history.past.slice(0, -1),
      future: [entry, ...history.future],
    },
    architecture: entry.before,
  };
}

export function redo(
  history: History,
): { history: History; architecture: Architecture } | null {
  const entry = history.future[0];
  if (!entry) return null;

  const past = [...history.past, entry];
  return {
    history: {
      past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
      future: history.future.slice(1),
    },
    architecture: entry.after,
  };
}

export function breakCoalescing(history: History): History {
  if (history.openCoalesceKey === undefined) return history;
  return { past: history.past, future: history.future };
}
