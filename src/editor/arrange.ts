import {
  align,
  countArrangeUnits,
  distribute,
  getTidyScope,
  tidy,
  type AlignMode,
  type ArrangeAxis,
  type MoveElements,
  type TidyScope,
} from "../domain/arrange";
import type { DispatchResult, EditorStore } from "./storeTypes";

export type ArrangeActionResult = DispatchResult & {
  message: string;
  changed: boolean;
  unitCount: number;
  /** Tidy reports whether it used the selection or the whole diagram as its scope. */
  scope?: TidyScope["kind"];
};

const ALREADY_ARRANGED = "Already arranged.";

function itemCount(unitCount: number): string {
  return `${unitCount} ${unitCount === 1 ? "item" : "items"}`;
}

function alignmentMessage(unitCount: number, mode: AlignMode): string {
  const items = itemCount(unitCount);
  switch (mode) {
    case "left":
      return `Aligned ${items} left.`;
    case "centers":
      return `Aligned ${items} by their centers.`;
    case "right":
      return `Aligned ${items} right.`;
    case "top":
      return `Aligned ${items} to the top.`;
    case "middles":
      return `Aligned ${items} by their middles.`;
    case "bottom":
      return `Aligned ${items} to the bottom.`;
  }
}

function dispatchMove(
  store: EditorStore,
  move: MoveElements | null,
  label: string,
  successMessage: string,
  unitCount: number,
  scope?: TidyScope["kind"],
): ArrangeActionResult {
  const details = { unitCount, ...(scope === undefined ? {} : { scope }) };
  if (move === null) {
    return { ok: true, message: ALREADY_ARRANGED, changed: false, ...details };
  }

  const previousRevision = store.getState().revision;
  const result = store.dispatch(
    { kind: "moveElements", componentPositions: move.componentPositions, groupDeltas: move.groupDeltas },
    { label },
  );
  if (!result.ok) {
    return { ...result, message: result.error.message, changed: false, ...details };
  }

  const changed = store.getState().revision !== previousRevision;
  return {
    ...result,
    message: changed ? successMessage : ALREADY_ARRANGED,
    changed,
    ...details,
  };
}

/** Align the selected geometric units and dispatch their movement as one undoable command. */
export function alignSelection(store: EditorStore, mode: AlignMode): ArrangeActionResult {
  const { architecture, selection } = store.getState();
  const unitCount = countArrangeUnits(architecture.components, architecture.groups, selection);
  return dispatchMove(
    store,
    align(architecture.components, architecture.groups, selection, mode),
    `Align ${mode}`,
    alignmentMessage(unitCount, mode),
    unitCount,
  );
}

/** Distribute the selected geometric units on an axis in one undoable command. */
export function distributeSelection(store: EditorStore, axis: ArrangeAxis): ArrangeActionResult {
  const { architecture, selection } = store.getState();
  const unitCount = countArrangeUnits(architecture.components, architecture.groups, selection);
  return dispatchMove(
    store,
    distribute(architecture.components, architecture.groups, selection, axis),
    axis === "horizontal" ? "Distribute horizontally" : "Distribute vertically",
    `Distributed ${itemCount(unitCount)}.`,
    unitCount,
  );
}

/** Tidy the selection, or the whole diagram when nothing is selected, in one undo step. */
export function tidyLayout(store: EditorStore): ArrangeActionResult {
  const { architecture, selection } = store.getState();
  const scope = getTidyScope(architecture.components, architecture.groups, selection);
  return dispatchMove(
    store,
    tidy(architecture.components, architecture.groups, selection),
    "Tidy layout",
    `Tidied ${itemCount(scope.unitCount)}.`,
    scope.unitCount,
    scope.kind,
  );
}
