/**
 * Quick Find (ROADMAP_V2_DESIGN §3.2): a modal APG combobox whose listbox is
 * always shown. It ranks with the pure `searchComponents` (text only, P1) and
 * reports the chosen component through `onChoose(id)`; selecting, revealing
 * and focusing the node is the caller's job.
 */
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import type { Architecture } from "../domain/types";
import { useEditorState } from "../editor/context";
import type { EditorState } from "../editor/storeTypes";
import { componentTypeDisplay } from "../canvas/labels";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { searchComponents, type ComponentSearchResult } from "./search";
import "./quickFind.css";

export interface QuickFindDialogProps {
  open: boolean;
  onClose(): void;
  onChoose(id: string): void;
}

export const QUICK_FIND_LIMIT = 50;
/** The status line waits for typing to pause so it is not read out on every key. */
export const QUICK_FIND_STATUS_DELAY_MS = 300;
const PAGE_STEP = 10;

const selectComponents = (state: EditorState) => state.architecture.components;
const selectGroups = (state: EditorState) => state.architecture.groups;

export function quickFindStatus(query: string, total: number, componentCount: number): string {
  if (componentCount === 0) return "No components yet";
  if (total === 0) return `No components match "${query.trim()}"`;
  if (total > QUICK_FIND_LIMIT) return `Showing ${QUICK_FIND_LIMIT} of ${total}. Keep typing to narrow the list.`;
  return total === 1 ? "1 result" : `${total} results`;
}

function HighlightedName({ name, ranges }: Pick<ComponentSearchResult, "ranges"> & { name: string }) {
  const parts: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach(([start, end], index) => {
    if (start > cursor) parts.push(name.slice(cursor, start));
    parts.push(<mark key={index}>{name.slice(start, end)}</mark>);
    cursor = end;
  });
  if (cursor < name.length) parts.push(name.slice(cursor));
  return <span className="sa-quick-find__name">{parts}</span>;
}

export function QuickFindDialog({ open, onClose, onChoose }: QuickFindDialogProps) {
  const components = useEditorState(selectComponents);
  const groups = useEditorState(selectGroups);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [opener, setOpener] = useState<HTMLElement | null>(null);

  const { results, total } = useMemo(() => {
    // Search reads names, type labels and group names only; the other fields are inert.
    const architecture: Architecture = {
      id: "",
      name: "",
      createdAt: "",
      updatedAt: "",
      components,
      relationships: [],
      groups,
    };
    return searchComponents(architecture, query, QUICK_FIND_LIMIT);
  }, [components, groups, query]);
  const status = quickFindStatus(query, total, components.length);
  const [shownStatus, setShownStatus] = useState(status);

  // Reset each time the dialog opens (derived state during render). The opener
  // is read before the native dialog moves focus inside.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      const active = document.activeElement;
      setOpener(active instanceof HTMLElement && active !== document.body ? active : null);
      setQuery("");
      setActiveIndex(0);
      setShownStatus(quickFindStatus("", components.length, components.length));
    }
  }

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => setShownStatus(status), QUICK_FIND_STATUS_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [open, status]);

  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const statusId = `${baseId}-status`;
  const optionId = (index: number) => `${baseId}-opt-${index}`;
  const active = results.length > 0 ? Math.min(activeIndex, results.length - 1) : -1;

  // How the current open cycle ends: "choose" leaves focus to the caller,
  // "cancel" returns it to the opener (or the canvas when the opener is gone).
  const endReason = useRef<"choose" | "cancel" | null>(null);

  useLayoutEffect(() => {
    if (open) {
      endReason.current = null;
      inputRef.current?.focus();
      return;
    }
    // Kept until the next open, so a late native `close` event cannot cancel twice.
    if (endReason.current !== "cancel") return;
    const target = opener?.isConnected ? opener : document.querySelector<HTMLElement>("[data-sa-canvas]");
    target?.focus({ preventScroll: true });
  }, [open, opener]);

  useEffect(() => {
    if (active < 0) return;
    // jsdom has no scrollIntoView.
    listboxRef.current?.children[active]?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  const cancel = () => {
    if (endReason.current === "cancel") return;
    endReason.current = "cancel";
    onClose();
  };

  const choose = (index: number) => {
    const result = results[index];
    if (!result) return;
    endReason.current = "choose";
    onChoose(result.component.id);
  };

  const handleDialogClose = () => {
    // The caller closed the dialog after a choice; anything else (native Escape) cancels.
    if (endReason.current === "choose" && !open) return;
    cancel();
  };

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    const count = results.length;
    switch (event.key) {
      case "ArrowDown":
        if (count) setActiveIndex((active + 1) % count);
        break;
      case "ArrowUp":
        if (count) setActiveIndex((active - 1 + count) % count);
        break;
      case "PageDown":
        if (count) setActiveIndex(Math.min(active + PAGE_STEP, count - 1));
        break;
      case "PageUp":
        if (count) setActiveIndex(Math.max(active - PAGE_STEP, 0));
        break;
      case "Enter":
        if (active >= 0) choose(active);
        break;
      case "Escape":
        // Native search fields clear on Escape; Quick Find closes without changes instead.
        event.stopPropagation();
        cancel();
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  return (
    <Dialog
      open={open}
      title="Find component"
      className="sa-quick-find"
      onClose={handleDialogClose}
      actions={<Button onClick={cancel}>Close</Button>}
    >
      <label className="sa-quick-find__field">
        <span>Component name</span>
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          aria-expanded={results.length > 0}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? optionId(active) : undefined}
          aria-describedby={statusId}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={onInputKeyDown}
        />
      </label>
      <p className="sa-quick-find__status" id={statusId} role="status" aria-live="polite" aria-atomic="true">
        {shownStatus}
      </p>
      <ul className="sa-quick-find__list" id={listboxId} role="listbox" aria-label="Components" ref={listboxRef}>
        {results.map((result, index) => (
          <li
            key={result.component.id}
            id={optionId(index)}
            role="option"
            aria-selected={index === active}
            className="sa-quick-find__option"
            data-active={index === active || undefined}
            // Keep focus (and the caret) in the combobox while clicking.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(index)}
          >
            <HighlightedName name={result.component.name} ranges={result.ranges} />
            <span className="sa-quick-find__meta">
              {componentTypeDisplay(result.component)}
              {result.groupName !== undefined ? ` · in ${result.groupName}` : null}
            </span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
