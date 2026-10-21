import { useId } from "react";
import type { ExternalLink } from "../../domain/types";
import { Button } from "../../ui/Button";
import { isSafeLink, SafeLink } from "../../ui/safeLink";
import { useDraft } from "./useDraft";

export interface LinksFieldProps {
  value: ExternalLink[] | undefined;
  /** Receives rows with a URL, or `undefined` when there are none. Rows without a URL stay local. */
  onChange: (value: ExternalLink[] | undefined) => void;
  onBlur?: () => void;
}

interface LinkRow {
  key: number;
  label: string;
  url: string;
}

let nextRowKey = 0;

function toRows(links: ExternalLink[] | undefined): LinkRow[] {
  return (links ?? []).map((link) => ({ key: nextRowKey++, label: link.label ?? "", url: link.url }));
}

export function rowsToLinks(rows: readonly Pick<LinkRow, "label" | "url">[]): ExternalLink[] | undefined {
  const links = rows
    .filter((row) => row.url.trim() !== "")
    .map((row) => (row.label === "" ? { url: row.url } : { label: row.label, url: row.url }));
  return links.length > 0 ? links : undefined;
}

function sameLinks(a: ExternalLink[] | undefined, b: ExternalLink[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((link, index) => link.label === b[index]?.label && link.url === b[index]?.url);
}

export function LinksField({ value, onChange, onBlur }: LinksFieldProps) {
  const id = useId();
  const [rows, setRows] = useDraft(value, toRows, rowsToLinks, sameLinks);

  function update(next: LinkRow[]) {
    setRows(next);
    const links = rowsToLinks(next);
    if (!sameLinks(links, value)) onChange(links);
  }

  function patchRow(key: number, patch: Partial<Pick<LinkRow, "label" | "url">>) {
    update(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  return (
    <div className="sa-field sa-links" role="group" aria-labelledby={`${id}-title`}>
      <span className="sa-field__label" id={`${id}-title`}>
        External links
      </span>
      {rows.length === 0 ? <p className="sa-field__hint">No links yet.</p> : null}
      {rows.map((row, index) => (
        <fieldset key={row.key} className="sa-links__row">
          <legend className="sa-visually-hidden">Link {index + 1}</legend>
          <div className="sa-links__inputs">
            <label className="sa-links__label" htmlFor={`${id}-${row.key}-label`}>
              Label
            </label>
            <input
              id={`${id}-${row.key}-label`}
              className="sa-input"
              type="text"
              autoComplete="off"
              value={row.label}
              onChange={(event) => patchRow(row.key, { label: event.target.value })}
              onBlur={onBlur}
            />
            <label className="sa-links__label" htmlFor={`${id}-${row.key}-url`}>
              URL
            </label>
            <input
              id={`${id}-${row.key}-url`}
              className="sa-input"
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://"
              value={row.url}
              onChange={(event) => patchRow(row.key, { url: event.target.value })}
              onBlur={onBlur}
            />
          </div>
          <div className="sa-links__row-actions">
            {isSafeLink(row.url) ? (
              <SafeLink url={row.url} className="sa-links__open" aria-label={`Open link ${index + 1}`}>
                Open
              </SafeLink>
            ) : null}
            <Button
              size="compact"
              variant="ghost"
              aria-label={`Remove link ${index + 1}`}
              onClick={() => {
                update(rows.filter((candidate) => candidate.key !== row.key));
                onBlur?.();
              }}
            >
              Remove
            </Button>
          </div>
        </fieldset>
      ))}
      <div>
        <Button
          size="compact"
          onClick={() => setRows([...rows, { key: nextRowKey++, label: "", url: "" }])}
        >
          Add link
        </Button>
      </div>
    </div>
  );
}
