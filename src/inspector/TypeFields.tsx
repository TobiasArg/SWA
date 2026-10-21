import type { ReactNode } from "react";
import { ACCESS_SCOPES, STORE_KINDS } from "../domain/constants";
import type { Component } from "../domain/types";
import { isSafeLink, SafeLink } from "../ui/safeLink";
import { SelectField, type SelectOption } from "./fields/SelectField";
import { TextField } from "./fields/TextField";
import { useInspectorCommands } from "./inspectorContext";

const NOT_SET: SelectOption = { value: "", label: "Not set" };

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const STORE_KIND_OPTIONS: SelectOption[] = [
  NOT_SET,
  ...STORE_KINDS.map((kind) => ({ value: kind, label: capitalize(kind) })),
];
const ACCESS_SCOPE_OPTIONS: SelectOption[] = [
  NOT_SET,
  ...ACCESS_SCOPES.map((scope) => ({ value: scope, label: capitalize(scope) })),
];

export const TYPE_FIELDS_TITLE: Record<Component["type"], string> = {
  agent: "Behavior",
  tool: "Tool details",
  memory: "Data store details",
  external_system: "External system details",
  decision: "Routing rule",
};

/** Type-specific `properties` fields for non-agent components (TD 7.2). All optional. */
export function TypeFields({ component }: { component: Component }) {
  const commands = useInspectorCommands();
  const properties = component.properties ?? {};

  function setProperty(key: string, value: string | undefined, coalesce: boolean) {
    commands.dispatch(
      { kind: "setComponentProperty", id: component.id, key, value },
      coalesce ? `${component.id}:properties.${key}` : undefined,
    );
  }

  function text(key: string, label: string, multiline: boolean, extra?: { hint?: string; trailing?: ReactNode }) {
    return (
      <TextField
        label={label}
        multiline={multiline}
        value={properties[key]}
        onChange={(value) => setProperty(key, value, true)}
        onBlur={commands.breakCoalescing}
        hint={extra?.hint}
        trailing={extra?.trailing}
      />
    );
  }

  function select(key: string, label: string, options: SelectOption[]) {
    return (
      <SelectField
        label={label}
        value={properties[key] ?? ""}
        options={options}
        onChange={(value) => setProperty(key, value === "" ? undefined : value, false)}
      />
    );
  }

  switch (component.type) {
    case "tool":
      return (
        <>
          {text("inputs", "Inputs", true)}
          {text("outputs", "Outputs", true)}
          {text("technicalReference", "Technical reference", false)}
        </>
      );
    case "memory":
      return (
        <>
          {select("storeKind", "Store kind", STORE_KIND_OPTIONS)}
          {select("accessScope", "Access scope", ACCESS_SCOPE_OPTIONS)}
          {text("contents", "Contents", true)}
          {text("accessNotes", "Access notes", true)}
        </>
      );
    case "external_system": {
      const link = properties.referenceLink;
      return (
        <>
          {text("systemKind", "System kind", false)}
          {text("boundaryNotes", "Boundary / ownership notes", true)}
          {text("referenceLink", "Reference link", false, {
            trailing:
              link && isSafeLink(link) ? (
                <SafeLink url={link} className="sa-field__link" aria-label="Open reference link">
                  Open
                </SafeLink>
              ) : null,
          })}
        </>
      );
    }
    case "decision":
      return (
        <>
          {text("condition", "Condition", true)}
          {text("outcomes", "Outcomes", true)}
        </>
      );
    case "agent":
      return null;
  }
}
