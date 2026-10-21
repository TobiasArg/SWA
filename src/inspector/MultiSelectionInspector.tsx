import type { Architecture, Selection } from "../domain/types";
import { Button } from "../ui/Button";
import { count } from "./ArchitectureInspector";
import { InspectorFooter, InspectorHeader, InspectorSection } from "./InspectorHeader";
import { useInspectorCommands } from "./inspectorContext";
import { getGroupOfComponent } from "./relationships";

export interface MultiSelectionInspectorProps {
  architecture: Architecture;
  selection: Selection;
}

export function MultiSelectionInspector({ architecture, selection }: MultiSelectionInspectorProps) {
  const commands = useInspectorCommands();
  const { componentIds, relationshipIds, groupIds } = selection;
  const hasComponents = componentIds.length > 0;
  const groupedIds = componentIds.filter((id) => getGroupOfComponent(architecture, id));
  const summary = `${count(componentIds.length, "component")}, ${count(
    relationshipIds.length,
    "relationship",
  )}, ${count(groupIds.length, "group")} selected`;

  return (
    <>
      <InspectorHeader kind="Selection" title={`${componentIds.length + relationshipIds.length + groupIds.length} elements`} />
      <InspectorSection title="Selection" defaultOpen>
        <p className="sa-multi__summary">{summary}</p>
        <div className="sa-multi__actions">
          <Button disabled={!hasComponents} onClick={() => commands.run("groupSelection")}>
            Group selected components
          </Button>
          <Button
            disabled={groupedIds.length === 0}
            onClick={() =>
              commands.dispatch({ kind: "assignToGroup", componentIds: groupedIds, groupId: null })
            }
          >
            Remove from groups
          </Button>
          <Button disabled={!hasComponents} onClick={() => commands.run("duplicateSelection")}>
            Duplicate components
          </Button>
        </div>
      </InspectorSection>
      <InspectorFooter>
        <Button variant="destructive-outline" onClick={() => commands.run("deleteSelection")}>
          Delete
        </Button>
      </InspectorFooter>
    </>
  );
}
