import { COMPONENT_TYPE_LABELS } from "../domain/constants";
import type { Architecture, Component } from "../domain/types";
import { Button } from "../ui/Button";
import type { IconName } from "../ui/icons";
import { AccentPicker } from "./AccentPicker";
import { AgentIdentityFields, AgentSections } from "./AgentSections";
import { LinksField } from "./fields/LinksField";
import { NotesField } from "./fields/NotesField";
import { SegmentedField } from "./fields/SegmentedField";
import { SelectField } from "./fields/SelectField";
import { TextField } from "./fields/TextField";
import { InspectorFooter, InspectorHeader, InspectorSection } from "./InspectorHeader";
import { useInspectorCommands } from "./inspectorContext";
import { RelationshipList } from "./RelationshipList";
import { getGroupOfComponent } from "./relationships";
import { TYPE_FIELDS_TITLE, TypeFields } from "./TypeFields";

const TYPE_ICON: Record<Component["type"], IconName> = {
  agent: "agent",
  tool: "tool",
  memory: "memory",
  external_system: "external",
  decision: "decision",
};

const KIND_OPTIONS = [
  { value: "agent", label: "Agent" },
  { value: "orchestrator", label: "Orchestrator" },
] as const;

export function componentTypeLabel(component: Component): string {
  return component.subtype === "orchestrator" ? "Orchestrator" : COMPONENT_TYPE_LABELS[component.type];
}

export function componentIcon(component: Component): IconName {
  return component.subtype === "orchestrator" ? "orchestrator" : TYPE_ICON[component.type];
}

export interface ComponentInspectorProps {
  architecture: Architecture;
  component: Component;
}

export function ComponentInspector({ architecture, component }: ComponentInspectorProps) {
  const commands = useInspectorCommands();
  const { id } = component;
  const isAgent = component.type === "agent";
  const group = getGroupOfComponent(architecture, id);
  const groupOptions = [
    { value: "", label: "None" },
    ...[...architecture.groups]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((candidate) => ({ value: candidate.id, label: candidate.name })),
  ];

  function update(field: "name" | "description" | "notes", value: string | undefined) {
    commands.dispatch({ kind: "updateComponent", id, patch: { [field]: value } }, `${id}:${field}`);
  }

  return (
    <>
      <InspectorHeader
        kind={componentTypeLabel(component)}
        title={component.name}
        icon={componentIcon(component)}
        inkType={component.subtype ?? component.type}
      />
      <InspectorSection title="Identity" defaultOpen>
        <TextField
          required
          label="Name"
          value={component.name}
          onChange={(value) => update("name", value)}
          onBlur={commands.breakCoalescing}
        />
        {isAgent ? (
          <SegmentedField
            legend="Kind"
            value={component.subtype ?? "agent"}
            options={KIND_OPTIONS}
            onChange={(value) =>
              commands.dispatch({
                kind: "setSubtype",
                id,
                subtype: value === "orchestrator" ? "orchestrator" : undefined,
              })
            }
          />
        ) : null}
        <TextField
          label="Description"
          hint="Shown on the node"
          value={component.description}
          onChange={(value) => update("description", value)}
          onBlur={commands.breakCoalescing}
        />
        {isAgent ? <AgentIdentityFields component={component} /> : null}
        <SelectField
          label="Group"
          value={group?.id ?? ""}
          options={groupOptions}
          onChange={(value) =>
            commands.dispatch({ kind: "assignToGroup", componentIds: [id], groupId: value || null })
          }
        />
      </InspectorSection>
      {isAgent ? (
        <AgentSections component={component} />
      ) : (
        <InspectorSection title={TYPE_FIELDS_TITLE[component.type]} defaultOpen>
          <TypeFields component={component} />
        </InspectorSection>
      )}
      {/* Accent is decoration only: border and details, never the fill (UI v2 §6, C7). */}
      <InspectorSection title="Appearance" defaultOpen>
        <AccentPicker component={component} />
      </InspectorSection>
      <InspectorSection title="Relationships" defaultOpen>
        <RelationshipList architecture={architecture} componentId={id} />
      </InspectorSection>
      <InspectorSection title="Documentation">
        <NotesField
          value={component.notes}
          onChange={(value) => update("notes", value)}
          onBlur={commands.breakCoalescing}
        />
        <LinksField
          value={component.links}
          onChange={(links) =>
            commands.dispatch({ kind: "updateComponent", id, patch: { links } }, `${id}:links`)
          }
          onBlur={commands.breakCoalescing}
        />
      </InspectorSection>
      <InspectorFooter>
        <Button onClick={() => commands.openConnectDialog(id)}>Connect…</Button>
        <Button onClick={() => commands.run("duplicateSelection")}>Duplicate</Button>
        <Button variant="destructive-outline" onClick={() => commands.run("deleteSelection")}>
          Delete
        </Button>
      </InspectorFooter>
    </>
  );
}
