import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toArchitectureFile } from "../domain/serialize";
import type { Architecture } from "../domain/types";
import {
  diagramKey,
  fingerprintDiagramKey,
  type SnapshotCaptureResult,
  type SnapshotClass,
  type SnapshotCounts,
  type SnapshotListItem,
  type SnapshotStore,
  type StorageEstimateLike,
} from "../persistence/snapshots";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/icons";
import "./versions.css";

/** Inline confirmation errors for restore steps 1 and 2 (ROADMAP_V2_DESIGN §6.6); step 3 shows the domain message. */
export const RESTORE_FLUSH_FAILED = "Your latest changes could not be saved, so nothing was restored.";
export const RESTORE_RECOVERY_FAILED = "A recovery version could not be saved, so nothing was restored.";

const MANUAL_LIMIT = 20;
const LOW_STORAGE_RATIO = 0.8;

const KIND_LABEL: Record<SnapshotClass, string> = {
  auto: "Automatic",
  manual: "Saved",
  recovery: "Before restore",
};

const EMPTY_TEXT =
  "No versions yet. A version is saved when you open an architecture that changed, every 10 minutes while you edit, and when you leave the editor.";
const FOOTER_TEXT =
  "Versions are stored only in this browser. Up to 30 automatic, 20 saved and 10 before-restore versions are kept. Versions are not included in JSON export.";
const LOW_STORAGE_TEXT =
  "This browser's storage is almost full, so automatic versions are paused. Saving a version now still works.";

export interface VersionsDialogProps {
  open: boolean;
  /** The current saved architecture: its name titles the dialog and its diagram marks the Current row. */
  architecture: Architecture;
  snapshots: Pick<SnapshotStore, "list">;
  /** Flushes and captures a manual version (§6.4). */
  onSaveNow(): Promise<SnapshotCaptureResult>;
  /** Runs restore steps 1–4 (§6.6). A rejection's message is shown inline and the confirmation stays open. */
  onRestore(id: string): Promise<void>;
  onClose(): void;
  /** Injectable for tests; the browser estimate is used when omitted. */
  estimateStorage?: () => Promise<StorageEstimateLike | undefined>;
  /** Injectable for tests; "Today" and "Yesterday" are relative to it. */
  now?: () => Date;
}

/** Versions dialog (ROADMAP_V2_DESIGN §6.7). Mounted per opening so every opening reloads the list. */
export function VersionsDialog(props: VersionsDialogProps) {
  return props.open ? <VersionsSession {...props} /> : null;
}

type ListState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; items: SnapshotListItem[] };

type SaveState =
  | { status: "idle" }
  | { status: "busy" }
  | { status: "done"; message: string }
  | { status: "error"; message: string };

interface Confirmation {
  item: Extract<SnapshotListItem, { status: "ok" }>;
  busy: boolean;
  error: string | null;
}

function VersionsSession({
  architecture,
  snapshots,
  onSaveNow,
  onRestore,
  onClose,
  estimateStorage = browserStorageEstimate,
  now = () => new Date(),
}: VersionsDialogProps) {
  const saveHintId = useId();
  const [list, setList] = useState<ListState>({ status: "loading" });
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const [lowStorage, setLowStorage] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const restoreButtons = useRef(new Map<string, HTMLButtonElement>());
  const architectureId = architecture.id;

  const currentFingerprint = useMemo(
    () => fingerprintDiagramKey(diagramKey(toArchitectureFile(architecture))),
    [architecture],
  );

  useEffect(() => {
    let active = true;
    snapshots.list(architectureId).then(
      (items) => {
        if (active) setList({ status: "ready", items });
      },
      () => {
        if (active) setList({ status: "error" });
      },
    );
    return () => {
      // Results of a superseded request or of a closed dialog are ignored.
      active = false;
    };
  }, [snapshots, architectureId, reloadToken]);

  useEffect(() => {
    let active = true;
    estimateStorage()
      .then((estimate) => {
        if (active && isLowStorage(estimate)) setLowStorage(true);
      })
      .catch(() => {
        // An unavailable estimate is not evidence that storage is low.
      });
    return () => {
      active = false;
    };
  }, [estimateStorage]);

  const retry = () => {
    setList({ status: "loading" });
    setReloadToken((token) => token + 1);
  };

  const saveNow = async () => {
    setSave({ status: "busy" });
    try {
      const result = await onSaveNow();
      if (result.status === "skipped") {
        setLowStorage(true);
        setSave({ status: "error", message: "Storage is almost full, so the version was not saved." });
      } else {
        setSave({
          status: "done",
          message: result.status === "created" ? "Version saved." : "No changes since the last version.",
        });
      }
    } catch (error) {
      setSave({ status: "error", message: errorMessage(error, "The version could not be saved.") });
    }
    setReloadToken((token) => token + 1);
  };

  const closeConfirmation = () => {
    const id = confirmation?.item.id;
    setConfirmation(null);
    if (id) restoreButtons.current.get(id)?.focus();
  };

  const confirmRestore = async () => {
    if (!confirmation || confirmation.busy) return;
    const { item } = confirmation;
    setConfirmation({ item, busy: true, error: null });
    try {
      await onRestore(item.id);
      setConfirmation(null);
    } catch (error) {
      setConfirmation({ item, busy: false, error: errorMessage(error, "The version could not be restored.") });
    }
  };

  const items = list.status === "ready" ? list.items : [];
  const manualCount = items.filter((item) => item.status === "ok" && item.snapshotClass === "manual").length;
  const replacesOldest = manualCount >= MANUAL_LIMIT;
  const today = now();
  const confirmLabel = confirmation ? formatVersionDate(confirmation.item.createdAt, today) : null;

  return (
    <>
      <Dialog
        open
        title={`Versions of '${architecture.name}'`}
        className="sa-versions"
        // A pending restore is owned by the confirmation; the list underneath stays put.
        dismissible={!confirmation?.busy}
        onClose={onClose}
        actions={
          <Button variant="primary" onClick={onClose} disabled={confirmation?.busy}>
            Close
          </Button>
        }
      >
        <div className="sa-versions__toolbar">
          <Button
            onClick={() => void saveNow()}
            disabled={save.status === "busy"}
            aria-describedby={replacesOldest ? saveHintId : undefined}
          >
            {save.status === "busy" ? "Saving version…" : "Save version now"}
          </Button>
          <p className="sa-versions__save-status" role="status">
            {save.status === "done" ? save.message : ""}
          </p>
          {replacesOldest ? (
            <p className="sa-versions__hint" id={saveHintId}>
              Saving removes the oldest saved version.
            </p>
          ) : null}
        </div>

        {save.status === "error" ? (
          <p className="sa-dialog__error" role="alert">
            <Icon name="alert" />
            <span>{save.message}</span>
          </p>
        ) : null}

        {lowStorage ? (
          <p className="sa-versions__notice">
            <Icon name="warning" />
            <span>{LOW_STORAGE_TEXT}</span>
          </p>
        ) : null}

        {list.status === "loading" ? (
          <p className="sa-versions__state" role="status">
            Loading versions…
          </p>
        ) : list.status === "error" ? (
          <div className="sa-versions__state sa-versions__state--error" role="alert">
            <p>
              <Icon name="alert" />
              <span>Versions could not be loaded.</span>
            </p>
            <Button size="compact" onClick={retry}>
              Retry
            </Button>
          </div>
        ) : items.length === 0 ? (
          <p className="sa-versions__state">{EMPTY_TEXT}</p>
        ) : (
          <ol className="sa-versions__list" aria-label="Versions, newest first">
            {items.map((item) => (
              <VersionRow
                key={item.id}
                item={item}
                today={today}
                current={item.status === "ok" && item.fingerprint === currentFingerprint}
                restoreRef={(element) => {
                  if (element) restoreButtons.current.set(item.id, element);
                  else restoreButtons.current.delete(item.id);
                }}
                onRestore={(okItem) => setConfirmation({ item: okItem, busy: false, error: null })}
              />
            ))}
          </ol>
        )}

        <p className="sa-versions__footer">{FOOTER_TEXT}</p>
      </Dialog>
      <ConfirmDialog
        open={confirmation !== null}
        title={confirmLabel ? `Restore the version from ${confirmLabel.sentence}?` : "Restore this version?"}
        description={
          confirmation
            ? `The diagram is replaced with this version (${formatCounts(confirmation.item.counts)}). Your current diagram is saved as a version first, so you can switch back. The name and description stay as they are.`
            : undefined
        }
        confirmLabel="Restore"
        busyLabel="Restoring…"
        busy={confirmation?.busy ?? false}
        error={confirmation?.error ?? null}
        onCancel={closeConfirmation}
        onConfirm={() => void confirmRestore()}
      />
    </>
  );
}

interface VersionRowProps {
  item: SnapshotListItem;
  today: Date;
  current: boolean;
  restoreRef(element: HTMLButtonElement | null): void;
  onRestore(item: Extract<SnapshotListItem, { status: "ok" }>): void;
}

function VersionRow({ item, today, current, restoreRef, onRestore }: VersionRowProps) {
  const date = item.createdAt ? formatVersionDate(item.createdAt, today) : null;
  const kind = item.snapshotClass ? KIND_LABEL[item.snapshotClass] : null;

  return (
    <li className={item.status === "damaged" ? "sa-versions__row sa-versions__row--damaged" : "sa-versions__row"}>
      <div className="sa-versions__meta">
        <p className="sa-versions__heading">
          {date ? (
            <time dateTime={item.createdAt} className="sa-versions__date">
              {date.short}
            </time>
          ) : (
            <span className="sa-versions__date">Unknown date</span>
          )}
          {kind ? <span className="sa-versions__kind">{kind}</span> : null}
          {current ? <span className="sa-versions__current">Current</span> : null}
        </p>
        {item.status === "ok" ? (
          <p className="sa-versions__counts">{formatCounts(item.counts)}</p>
        ) : (
          <p className="sa-versions__damaged">
            <Icon name="alert" />
            <span>{item.message}</span>
          </p>
        )}
      </div>
      {item.status === "ok" ? (
        <Button
          ref={restoreRef}
          size="compact"
          className="sa-versions__restore"
          disabled={current}
          aria-label={`Restore the version from ${date?.sentence ?? "an unknown date"}`}
          onClick={() => onRestore(item)}
        >
          Restore…
        </Button>
      ) : null}
    </li>
  );
}

export interface VersionDateLabel {
  /** Row form: "Today 14:05", "Yesterday 09:12" or a localized date and time. */
  short: string;
  /** Sentence form for names and titles: "today at 14:05". */
  sentence: string;
}

export function formatVersionDate(iso: string, now: Date, locale?: string): VersionDateLabel {
  const date = new Date(iso);
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(date);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameLocalDay(date, now)) return { short: `Today ${time}`, sentence: `today at ${time}` };
  if (sameLocalDay(date, yesterday)) return { short: `Yesterday ${time}`, sentence: `yesterday at ${time}` };
  const full = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
  return { short: full, sentence: full };
}

export function formatCounts(counts: SnapshotCounts): string {
  return [
    plural(counts.components, "component", "components"),
    plural(counts.relationships, "relationship", "relationships"),
    plural(counts.groups, "group", "groups"),
  ].join(" · ");
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function sameLocalDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function isLowStorage(estimate: StorageEstimateLike | undefined): boolean {
  return (
    estimate !== undefined &&
    typeof estimate.usage === "number" &&
    typeof estimate.quota === "number" &&
    estimate.quota > 0 &&
    estimate.usage / estimate.quota > LOW_STORAGE_RATIO
  );
}

async function browserStorageEstimate(): Promise<StorageEstimateLike | undefined> {
  if (typeof navigator === "undefined" || typeof navigator.storage?.estimate !== "function") return undefined;
  return navigator.storage.estimate();
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
