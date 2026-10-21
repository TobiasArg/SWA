import { useCallback, useEffect, useRef, useState } from "react";
import type { AppServices } from "../app/services";
import type { ArchitectureFile } from "../domain/types";
import type { ValidationIssue } from "../domain/validation/issues";
import type { Repository, StoredRecord } from "../persistence/types";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Icon, type IconName } from "../ui/icons";
import { announce } from "../ui/LiveRegion";
import { useToast } from "../ui/Toast";
import { ArchitectureRow, recordName } from "./ArchitectureRow";
import { ImportErrorDialog, NameDialog } from "./dialogs";
import "./library.css";

export const BACKUP_NOTICE =
  "Your architectures are stored only in this browser. Clearing site data erases them. Export to JSON to keep a backup.";

const BACKUP_DISMISSED_KEY = "sa:ui:backup-notice-dismissed";
const DEFAULT_NAME = "Untitled architecture";
const TYPE_ICONS: IconName[] = ["orchestrator", "agent", "tool", "memory", "external", "decision"];

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(BACKUP_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    window.localStorage.setItem(BACKUP_DISMISSED_KEY, "1");
  } catch {
    // UI preferences are best effort (TD 8.1).
  }
}

function sortRecords(records: StoredRecord[]): StoredRecord[] {
  const time = (record: StoredRecord) =>
    record.status === "ok" ? Date.parse(record.file.architecture.updatedAt) || 0 : Number.NEGATIVE_INFINITY;
  return [...records].sort((a, b) => time(b) - time(a) || recordName(a).localeCompare(recordName(b)));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface LibraryScreenProps {
  repository: Repository;
  services: AppServices;
  /** Builds the editor link for an architecture (`#/a/<id>`). */
  editorHref(id: string): string;
  onOpen(id: string): void;
  now?: () => string;
}

type DialogState =
  | { kind: "none" }
  | { kind: "create" }
  | { kind: "rename"; file: ArchitectureFile }
  | { kind: "delete"; record: StoredRecord };

export function LibraryScreen({
  repository,
  services,
  editorHref,
  onOpen,
  now = () => new Date().toISOString(),
}: LibraryScreenProps) {
  const { showToast } = useToast();
  const [records, setRecords] = useState<StoredRecord[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const [busy, setBusy] = useState(false);
  const [importIssues, setImportIssues] = useState<ValidationIssue[] | null>(null);
  const [noticeDismissed, setNoticeDismissed] = useState(readDismissed);
  const fileInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const list = await repository.list();
      if (!mounted.current) return;
      setRecords(sortRecords(list));
      setLoadError(null);
    } catch (error) {
      if (mounted.current) setLoadError(errorMessage(error));
    }
  }, [repository]);

  useEffect(() => {
    mounted.current = true;
    const refresh = () => {
      repository.list().then(
        (list) => {
          if (!mounted.current) return;
          setRecords(sortRecords(list));
          setLoadError(null);
        },
        (error: unknown) => {
          if (mounted.current) setLoadError(errorMessage(error));
        },
      );
    };
    refresh();
    const unsubscribe = services.subscribeToRepositoryChanges(refresh);
    return () => {
      mounted.current = false;
      unsubscribe();
    };
  }, [repository, services]);

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
    } catch (error) {
      showToast(errorMessage(error));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const closeDialog = () => setDialog({ kind: "none" });

  const create = (name: string) =>
    run(async () => {
      const file = await repository.create(name);
      services.requestPersistentStorage();
      closeDialog();
      onOpen(file.architecture.id);
    });

  const rename = (file: ArchitectureFile, name: string) =>
    run(async () => {
      await repository.rename(file.architecture.id, name);
      closeDialog();
      announce(`Renamed to ${name}.`);
      await load();
    });

  const duplicate = (file: ArchitectureFile) =>
    run(async () => {
      const copy = await repository.duplicate(file.architecture.id);
      showToast(`Duplicated as '${copy.architecture.name}'.`);
      await load();
    });

  const remove = (record: StoredRecord) =>
    run(async () => {
      await repository.remove(record.status === "ok" ? record.file.architecture.id : record.id);
      closeDialog();
      announce(`Deleted ${recordName(record)}.`);
      await load();
    });

  const exportRecord = (record: StoredRecord) => {
    if (record.status === "ok") services.exportArchitectureJson(record.file.architecture);
    else services.exportRawJson(record.raw, record.name);
  };

  const importFile = (file: File) =>
    run(async () => {
      const result = await services.importArchitectureFile(file, repository, now);
      if (!result.ok) {
        setImportIssues(result.issues);
        announce("The file can't be imported. Nothing was saved.");
        return;
      }
      services.requestPersistentStorage();
      if (result.renamed) {
        showToast(
          `Imported as '${result.file.architecture.name}' because an architecture with the same ID already exists.`,
        );
      }
      announce(`Imported ${result.file.architecture.name}.`);
      onOpen(result.file.architecture.id);
    });

  const startImport = () => fileInput.current?.click();
  const empty = records !== null && records.length === 0;

  return (
    <div className="sa-library">
      <main className="sa-library__main" aria-labelledby="sa-library-title">
        <header className="sa-library__header">
          <h1 id="sa-library-title" className="sa-library__title">
            Architectures
          </h1>
          {records === null || empty ? null : (
            <div className="sa-library__header-actions">
              <Button onClick={startImport} disabled={busy}>
                Import JSON
              </Button>
              <Button variant="primary" onClick={() => setDialog({ kind: "create" })} disabled={busy}>
                New architecture
              </Button>
            </div>
          )}
        </header>

        {noticeDismissed ? null : (
          <div className="sa-library__notice" role="note">
            <Icon name="info" />
            <p>{BACKUP_NOTICE}</p>
            <Button
              variant="ghost"
              size="compact"
              onClick={() => {
                writeDismissed();
                setNoticeDismissed(true);
              }}
            >
              Dismiss
            </Button>
          </div>
        )}

        {loadError ? (
          <div className="sa-library__error" role="alert">
            <Icon name="alert" />
            <p>The library could not be loaded ({loadError}).</p>
            <Button size="compact" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : null}

        {empty ? (
          <section className="sa-library__empty" aria-labelledby="sa-library-empty-title">
            <div className="sa-library__empty-icons" aria-hidden>
              {TYPE_ICONS.map((name) => (
                <span key={name} className={`sa-library__type-icon sa-library__type-icon--${name}`}>
                  <Icon name={name} />
                </span>
              ))}
            </div>
            <h2 id="sa-library-empty-title" className="sa-library__empty-title">
              No architectures yet.
            </h2>
            <p className="sa-library__empty-text">
              Create an architecture to start mapping agents, tools and data stores, or import a JSON file.
            </p>
            <div className="sa-library__empty-actions">
              <Button variant="primary" onClick={() => setDialog({ kind: "create" })} disabled={busy}>
                New architecture
              </Button>
              <Button onClick={startImport} disabled={busy}>
                Import JSON
              </Button>
            </div>
          </section>
        ) : (
          <div className="sa-library__card">
            <table className="sa-library__table" aria-busy={records === null || undefined}>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Last edited</th>
                  <th scope="col" className="sa-library__counts-heading">
                    Contents
                  </th>
                  <th scope="col">
                    <span className="sa-visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {records === null
                  ? [0, 1, 2].map((row) => (
                      <tr key={row} className="sa-library-row sa-library-row--skeleton" aria-hidden>
                        <td><span className="sa-skeleton sa-skeleton--name" /></td>
                        <td><span className="sa-skeleton sa-skeleton--date" /></td>
                        <td className="sa-library-row__counts"><span className="sa-skeleton sa-skeleton--counts" /></td>
                        <td />
                      </tr>
                    ))
                  : records.map((record) => (
                      <ArchitectureRow
                        key={record.status === "ok" ? record.file.architecture.id : record.id}
                        record={record}
                        href={record.status === "ok" ? editorHref(record.file.architecture.id) : undefined}
                        onRename={(file) => setDialog({ kind: "rename", file })}
                        onDuplicate={(file) => void duplicate(file)}
                        onExport={exportRecord}
                        onExportMarkdown={(file) => services.exportArchitectureMarkdown(file.architecture)}
                        onDelete={(target) => setDialog({ kind: "delete", record: target })}
                      />
                    ))}
              </tbody>
            </table>
            {records === null ? <p className="sa-visually-hidden" role="status">Loading architectures…</p> : null}
          </div>
        )}
      </main>

      <footer className="sa-library__footer">{BACKUP_NOTICE}</footer>

      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        aria-hidden
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void importFile(file);
        }}
      />

      <NameDialog
        open={dialog.kind === "create"}
        title="New architecture"
        confirmLabel="Create"
        initialName={DEFAULT_NAME}
        busy={busy}
        onCancel={closeDialog}
        onSubmit={(name) => void create(name)}
      />
      <NameDialog
        open={dialog.kind === "rename"}
        title="Rename architecture"
        confirmLabel="Rename"
        initialName={dialog.kind === "rename" ? dialog.file.architecture.name : ""}
        busy={busy}
        onCancel={closeDialog}
        onSubmit={(name) => {
          if (dialog.kind === "rename") void rename(dialog.file, name);
        }}
      />
      <ConfirmDialog
        open={dialog.kind === "delete"}
        title={dialog.kind === "delete" ? `Delete '${recordName(dialog.record)}'?` : "Delete architecture?"}
        busy={busy}
        onCancel={closeDialog}
        onConfirm={() => {
          if (dialog.kind === "delete") void remove(dialog.record);
        }}
      >
        <p className="sa-library__confirm-text">
          This cannot be undone. Export it to JSON first if you want a backup.
        </p>
      </ConfirmDialog>
      <ImportErrorDialog issues={importIssues} onClose={() => setImportIssues(null)} />
    </div>
  );
}
