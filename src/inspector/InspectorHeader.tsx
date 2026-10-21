import type { ReactNode } from "react";
import { Icon, type IconName } from "../ui/icons";

export interface InspectorHeaderProps {
  kind: string;
  title: string;
  icon?: IconName;
  /** Domain-derived type for the ink color (UI 12); never a user-provided value. */
  inkType?: string;
}

export function InspectorHeader({ kind, title, icon, inkType }: InspectorHeaderProps) {
  return (
    <header className="sa-inspector__header">
      <p className="sa-inspector__kind" data-ink={inkType}>
        {icon ? <Icon name={icon} /> : null}
        {kind}
      </p>
      <h2 className="sa-inspector__title">{title}</h2>
    </header>
  );
}

export interface InspectorSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function InspectorSection({ title, defaultOpen = false, children }: InspectorSectionProps) {
  return (
    <details className="sa-inspector__section" open={defaultOpen}>
      <summary className="sa-inspector__summary">{title}</summary>
      <div className="sa-inspector__section-body">{children}</div>
    </details>
  );
}

export function InspectorFooter({ children }: { children: ReactNode }) {
  return <div className="sa-inspector__footer">{children}</div>;
}
