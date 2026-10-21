import { useState } from "react";

/**
 * Local draft for a field bound to a stored value (TD 7). The draft follows the
 * store only when the stored value changes for reasons other than this field's
 * own edits (undo/redo, another view), so typing is never overwritten by the
 * normalized value it produced.
 */
export function useDraft<T, D>(
  stored: T,
  toDraft: (value: T) => D,
  toValue: (draft: D) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): [D, (draft: D) => void] {
  const [draft, setDraft] = useState(() => toDraft(stored));
  const [seen, setSeen] = useState(stored);

  if (!isEqual(seen, stored)) {
    setSeen(stored);
    if (!isEqual(toValue(draft), stored)) setDraft(toDraft(stored));
  }

  return [draft, setDraft];
}

export function optionalText(draft: string): string | undefined {
  return draft === "" ? undefined : draft;
}

export function textDraft(value: string | undefined): string {
  return value ?? "";
}
