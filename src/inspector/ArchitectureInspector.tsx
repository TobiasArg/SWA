import type { Architecture } from "../domain/types";
import { TextAreaField, TextField } from "./fields/TextField";
import { InspectorHeader, InspectorSection } from "./InspectorHeader";
import { useInspectorCommands } from "./inspectorContext";

export function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** Shown when nothing is selected. Name and description changes are not undoable (TD 5.2). */
export function ArchitectureInspector({ architecture }: { architecture: Architecture }) {
  const { store } = useInspectorCommands();

  return (
    <>
      <InspectorHeader kind="Architecture" title={architecture.name} />
      <InspectorSection title="Identity" defaultOpen>
        <TextField
          required
          label="Name"
          value={architecture.name}
          onChange={(value) => store.renameArchitecture(value)}
        />
        <TextAreaField
          label="Description"
          value={architecture.description}
          onChange={(value) => store.setArchitectureDescription(value)}
        />
      </InspectorSection>
      <InspectorSection title="Overview" defaultOpen>
        <ul className="sa-counts">
          <li>{count(architecture.components.length, "component")}</li>
          <li>{count(architecture.relationships.length, "relationship")}</li>
          <li>{count(architecture.groups.length, "group")}</li>
        </ul>
        <p className="sa-inspector__empty">
          Add components from the library on the left: click to place, or drag onto the canvas.
          Select an element to edit it here.
        </p>
      </InspectorSection>
    </>
  );
}

