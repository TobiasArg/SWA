/**
 * Keyboard alternative for creating a relationship (TD 6.3, UI handoff 8.4).
 *
 * A native modal `<dialog>` (ui/Dialog) titled "Connect" with a *Relationship
 * type* select (10 types, default Delegates To) and a *Target component* select
 * (every component except the source, sorted by name). A hint reads the result
 * as a sentence; a note states the type's direction rule. Connect dispatches ONE
 * `addRelationship` with the type's default direction, selects it and closes.
 * Escape / Cancel close without changes; the native dialog returns focus to the
 * element that opened it.
 */
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { RELATIONSHIP_TYPES, defaultDirection } from "../domain/constants";
import { describeRelationship } from "../domain/selectors";
import type { Architecture, Component, RelationshipType } from "../domain/types";
import { useEditorState, useEditorStore } from "../editor/context";
import type { EditorState } from "../editor/storeTypes";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import {
  DEFAULT_CONNECT_TYPE,
  RELATIONSHIP_TYPE_ORDER,
  addRelationshipAndSelect,
  directionNote,
} from "./connection";
import "./connect.css";

export interface ConnectDialogProps {
  open: boolean;
  sourceId: string | null;
  onClose(): void;
}

const selectComponents = (state: EditorState) => state.architecture.components;

/** Every component except the source, sorted by name (then id, for stability). */
export function connectTargets(components: readonly Component[], sourceId: string | null): Component[] {
  return components
    .filter((component) => component.id !== sourceId)
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

function readsAs(components: Component[], type: RelationshipType, sourceId: string, targetId: string): string {
  const architecture: Architecture = {
    id: "",
    name: "",
    createdAt: "",
    updatedAt: "",
    components,
    relationships: [],
    groups: [],
  };
  return describeRelationship(architecture, {
    id: "",
    type,
    sourceId,
    targetId,
    direction: defaultDirection(type),
  });
}

/** Static note: keyboard connections never pin ports (UI v2 §8.4, D3). */
export const PORTS_NOTE = "Ports are chosen automatically from the components' positions.";

export function ConnectDialog({ open, sourceId, onClose }: ConnectDialogProps) {
  const store = useEditorStore();
  const components = useEditorState(selectComponents);
  const targets = useMemo(() => connectTargets(components, sourceId), [components, sourceId]);
  const source = components.find((component) => component.id === sourceId) ?? null;

  const [type, setType] = useState<RelationshipType>(DEFAULT_CONNECT_TYPE);
  const [chosenTarget, setChosenTarget] = useState<string | null>(null);
  const focusRelationshipAfterClose = useRef<string | null>(null);
  const dialogOpener = useRef<HTMLElement | null>(null);
  const closeRequested = useRef(false);
  const wasOpen = useRef(open);

  useLayoutEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    dialogOpener.current = active instanceof HTMLElement ? active : null;
  }, [open]);

  useLayoutEffect(() => {
    if (open) closeRequested.current = false;
  }, [open]);

  // Reset the form each time the dialog opens (derived state during render).
  const [wasOpenState, setWasOpen] = useState(open);
  if (wasOpenState !== open) {
    setWasOpen(open);
    if (open) {
      setType(DEFAULT_CONNECT_TYPE);
      setChosenTarget(null);
    }
  }

  useEffect(() => {
    const closedRelationshipId = wasOpen.current && !open ? focusRelationshipAfterClose.current : null;
    wasOpen.current = open;
    if (!closedRelationshipId) return;

    // The source inspector button may disappear when selection moves to the new
    // relationship. Wait until the native dialog restores its opener, then move
    // focus to the relationship that now owns the inspector. If the user begins
    // another keyboard or pointer action first, don't steal focus back later.
    let frame = 0;
    let nextFrame = 0;
    const removeUserIntentListeners = () => {
      document.removeEventListener("keydown", cancelDeferredFocus, true);
      document.removeEventListener("pointerdown", cancelDeferredFocus, true);
      document.removeEventListener("focusin", cancelOnFocusChange, true);
    };
    const cancelDeferredFocus = () => {
      if (focusRelationshipAfterClose.current !== closedRelationshipId) return;
      focusRelationshipAfterClose.current = null;
      window.cancelAnimationFrame(frame);
      if (nextFrame) window.cancelAnimationFrame(nextFrame);
      removeUserIntentListeners();
    };
    const cancelOnFocusChange = (event: FocusEvent) => {
      if (
        event.target === dialogOpener.current ||
        event.target === document.body ||
        event.target === document.documentElement
      ) {
        return;
      }
      cancelDeferredFocus();
    };
    document.addEventListener("keydown", cancelDeferredFocus, true);
    document.addEventListener("pointerdown", cancelDeferredFocus, true);
    document.addEventListener("focusin", cancelOnFocusChange, true);
    frame = window.requestAnimationFrame(() => {
      nextFrame = window.requestAnimationFrame(() => {
        removeUserIntentListeners();
        if (focusRelationshipAfterClose.current !== closedRelationshipId) return;
        const edge = [...document.querySelectorAll<HTMLElement>(".react-flow__edge")].find(
          (element) => element.getAttribute("data-id") === closedRelationshipId,
        );
        edge?.focus({ preventScroll: true });
        focusRelationshipAfterClose.current = null;
      });
    });
    return () => {
      removeUserIntentListeners();
      window.cancelAnimationFrame(frame);
      if (nextFrame) window.cancelAnimationFrame(nextFrame);
    };
  }, [open]);

  const targetId =
    chosenTarget !== null && targets.some((target) => target.id === chosenTarget)
      ? chosenTarget
      : (targets[0]?.id ?? null);

  const typeId = useId();
  const targetSelectId = useId();
  const hintId = useId();
  const noteId = useId();
  const formId = useId();

  const canConnect = Boolean(source && targetId);

  const requestClose = useCallback(() => {
    if (closeRequested.current) return;
    closeRequested.current = true;
    onClose();
  }, [onClose]);

  const handleDialogClose = useCallback(() => {
    // A native close event may be queued by the previous open/close cycle and
    // arrive after this controlled dialog has already reopened.
    if (open) return;
    requestClose();
  }, [open, requestClose]);

  const closeOnEscape = (event: ReactKeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    requestClose();
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!source || !targetId) return;
    const relationshipId = addRelationshipAndSelect(store, type, source.id, targetId);
    if (!relationshipId) return;
    focusRelationshipAfterClose.current = relationshipId;
    requestClose();
  };

  return (
    <Dialog
      open={open}
      title="Connect"
      className="sa-connect-dialog"
      onClose={handleDialogClose}
      onKeyDownCapture={closeOnEscape}
      actions={
        <>
          <Button onClick={requestClose}>Cancel</Button>
          <Button variant="primary" type="submit" form={formId} disabled={!canConnect}>
            Connect
          </Button>
        </>
      }
    >
      <form id={formId} className="sa-connect-dialog__fields" onSubmit={submit}>
        <div className="sa-connect-dialog__field">
          <label className="sa-connect-dialog__label" htmlFor={typeId}>
            Relationship type
          </label>
          <select
            id={typeId}
            value={type}
            aria-describedby={noteId}
            onChange={(event) => setType(event.target.value as RelationshipType)}
          >
            {RELATIONSHIP_TYPE_ORDER.map((key) => (
              <option key={key} value={key}>
                {RELATIONSHIP_TYPES[key].label}
              </option>
            ))}
          </select>
          <p className="sa-connect-dialog__note" id={noteId}>
            {directionNote(type)}
          </p>
          <p className="sa-connect-dialog__note">{PORTS_NOTE}</p>
        </div>
        <div className="sa-connect-dialog__field">
          <label className="sa-connect-dialog__label" htmlFor={targetSelectId}>
            Target component
          </label>
          <select
            id={targetSelectId}
            value={targetId ?? ""}
            disabled={targets.length === 0}
            aria-describedby={hintId}
            onChange={(event) => setChosenTarget(event.target.value)}
          >
            {targets.length === 0 ? <option value="">No other components</option> : null}
            {targets.map((component) => (
              <option key={component.id} value={component.id}>
                {component.name}
              </option>
            ))}
          </select>
        </div>
        <p className="sa-connect-dialog__hint" id={hintId} aria-live="polite">
          {source && targetId
            ? readsAs(components, type, source.id, targetId)
            : "Add another component to connect to."}
        </p>
      </form>
    </Dialog>
  );
}
