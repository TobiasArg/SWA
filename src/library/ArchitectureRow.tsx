import type { ArchitectureFile } from "../domain/types";
import type { StoredRecord } from "../persistence/types";
import { Button } from "../ui/Button";
import { Icon } from "../ui/icons";

/** Relative "last edited" text, with the exact time for the cell's `title` (TD 11.2). */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "Unknown";
  const seconds = Math.round((time - now) / 1000);
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const abs = Math.abs(seconds);
  if (abs < 45) return "just now";
  if (abs < 45 * 60) return format.format(Math.round(seconds / 60), "minute");
  if (abs < 22 * 3600) return format.format(Math.round(seconds / 3600), "hour");
  if (abs < 26 * 86400) return format.format(Math.round(seconds / 86400), "day");
  return new Date(time).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatExactTime(iso: string): string {
  const time = Date.parse(iso);
  return Number.isFinite(time)
    ? new Date(time).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : iso;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function contentSummary(file: ArchitectureFile): string {
  const { components, relationships, groups } = file.architecture;
  return [
    plural(components.length, "component"),
    plural(relationships.length, "relationship"),
    plural(groups.length, "group"),
  ].join(" · ");
}

export interface ArchitectureRowProps {
  record: StoredRecord;
  href?: string;
  onRename(file: ArchitectureFile): void;
  onDuplicate(file: ArchitectureFile): void;
  onExport(record: StoredRecord): void;
  /** Downloads the architecture as a Markdown document (OK rows only). */
  onExportMarkdown(file: ArchitectureFile): void;
  onDelete(record: StoredRecord): void;
}

export function recordName(record: StoredRecord): string {
  return record.status === "ok" ? record.file.architecture.name : record.name;
}

export function ArchitectureRow({
  record,
  href,
  onRename,
  onDuplicate,
  onExport,
  onExportMarkdown,
  onDelete,
}: ArchitectureRowProps) {
  const name = recordName(record);

  if (record.status === "damaged") {
    return (
      <tr className="sa-library-row sa-library-row--damaged" data-record-id={record.id}>
        <th scope="row" className="sa-library-row__name">
          <span className="sa-library-row__damaged-name">{name}</span>
          <span className="sa-library-row__damaged-note">
            <Icon name="warning" />
            Can't be opened
          </span>
          {record.issues[0] ? (
            <span className="sa-library-row__issue">{record.issues[0].message}</span>
          ) : null}
        </th>
        <td className="sa-library-row__time">—</td>
        <td className="sa-library-row__counts">—</td>
        <td className="sa-library-row__actions">
          <div className="sa-library-row__action-list">
            <Button size="compact" aria-label={`Export raw JSON of ${name}`} onClick={() => onExport(record)}>
              Export raw JSON
            </Button>
            <Button
              size="compact"
              variant="destructive-outline"
              aria-label={`Delete ${name}`}
              onClick={() => onDelete(record)}
            >
              Delete
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  const { file } = record;
  return (
    <tr className="sa-library-row" data-record-id={file.architecture.id}>
      <th scope="row" className="sa-library-row__name">
        <a className="sa-library-row__link" href={href}>
          {name}
        </a>
        <span className="sa-library-row__counts-inline" aria-hidden>{contentSummary(file)}</span>
      </th>
      <td className="sa-library-row__time">
        <time dateTime={file.architecture.updatedAt} title={formatExactTime(file.architecture.updatedAt)}>
          {formatRelativeTime(file.architecture.updatedAt)}
        </time>
      </td>
      <td className="sa-library-row__counts">{contentSummary(file)}</td>
      <td className="sa-library-row__actions">
        <div className="sa-library-row__action-list">
          <Button size="compact" aria-label={`Rename ${name}`} onClick={() => onRename(file)}>
            Rename
          </Button>
          <Button size="compact" aria-label={`Duplicate ${name}`} onClick={() => onDuplicate(file)}>
            Duplicate
          </Button>
          <Button size="compact" aria-label={`Export JSON of ${name}`} onClick={() => onExport(record)}>
            Export JSON
          </Button>
          <Button size="compact" aria-label={`Export Markdown of ${name}`} onClick={() => onExportMarkdown(file)}>
            Export Markdown
          </Button>
          <Button
            size="compact"
            variant="destructive-outline"
            aria-label={`Delete ${name}`}
            onClick={() => onDelete(record)}
          >
            Delete
          </Button>
        </div>
      </td>
    </tr>
  );
}
