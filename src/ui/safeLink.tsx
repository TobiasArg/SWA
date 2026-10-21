import type { AnchorHTMLAttributes, ReactNode } from "react";

export function isSafeLink(value: string): boolean {
  try {
    const protocol = new URL(value).protocol.toLowerCase();
    return protocol === "http:" || protocol === "https:" || protocol === "mailto:";
  } catch {
    return false;
  }
}

export interface SafeLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "target" | "rel"> {
  url: string;
  children?: ReactNode;
}

export function SafeLink({ url, children, className, ...anchorProps }: SafeLinkProps) {
  if (!isSafeLink(url)) {
    return <span className={className}>{children ?? url}</span>;
  }

  return (
    <a
      {...anchorProps}
      className={className ? `sa-safe-link ${className}` : "sa-safe-link"}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children ?? url}
    </a>
  );
}
