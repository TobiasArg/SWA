import Markdown, { type Components, type ExtraProps } from "react-markdown";
import type { ComponentPropsWithoutRef } from "react";
import { isSafeLink, SafeLink } from "./safeLink";
import "./MarkdownPreview.css";

export const EMPTY_NOTES_TEXT = "No notes yet.";

/** Keeps only http, https and mailto URLs; anything else becomes an empty, inert value. */
export function previewUrlTransform(url: string): string {
  return isSafeLink(url) ? url : "";
}

function PreviewLink({ href, children }: ComponentPropsWithoutRef<"a"> & ExtraProps) {
  return <SafeLink url={href ?? ""}>{children}</SafeLink>;
}

/** Images never load: the preview shows a text placeholder instead of fetching any URL. */
function PreviewImage({ alt }: ComponentPropsWithoutRef<"img"> & ExtraProps) {
  return <span className="sa-md__image">{alt ? `[image: ${alt}]` : "[image]"}</span>;
}

const COMPONENTS: Components = { a: PreviewLink, img: PreviewImage };

export interface MarkdownPreviewProps {
  source: string | undefined;
}

/**
 * Read-only Markdown rendering for notes. Raw HTML is skipped (no raw-HTML
 * plugin is installed), links open only for http/https/mailto, and images are
 * replaced by text so the preview never makes a network request.
 */
export default function MarkdownPreview({ source }: MarkdownPreviewProps) {
  if (!source || source.trim() === "") {
    return <p className="sa-md sa-md--empty">{EMPTY_NOTES_TEXT}</p>;
  }

  return (
    <div className="sa-md">
      <Markdown skipHtml components={COMPONENTS} urlTransform={previewUrlTransform}>
        {source}
      </Markdown>
    </div>
  );
}
