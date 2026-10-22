import type { Architecture, Group } from "../domain/types";
import { Button } from "../ui/Button";
import { NotesField } from "./fields/NotesField";
import { TextField } from "./fields/TextField";
import { InspectorFooter, InspectorHeader, InspectorSection } from "./InspectorHeader";
import { useInspectorCommands } from "./inspectorContext";
import { componentName } from "./relationships";

export const EMPTY_GROUP_TEXT =
  "No members. Select components and use Group, or assign them in their inspector.";

export interface GroupInspectorProps {
  architecture: Architecture;
  group: Group;
}

export function GroupInspector({ architecture, group }: GroupInspectorProps) {
  const commands = useInspectorCommands();
  const { id } = group;

  function update(field: "name" | "description" | "notes", value: string | undefined) {
    commands.dispatch({ kind: "updateGroup", id, patch: { [field]: value } }, `${id}:${field}`);
  }

  return (
    <>
      <InspectorHeader kind="Group" title={group.name} />
      <InspectorSection title="Identity" defaultOpen>
        <TextField
          required
          label="Name"
          value={group.name}
          onChange={(value) => update("name", value)}
          onBlur={commands.breakCoalescing}
        />
        <TextField
          label="Description"
          value={group.description}
          onChange={(value) => update("description", value)}
          onBlur={commands.breakCoalescing}
        />
      </InspectorSection>
      <InspectorSection title={`Members (${group.memberComponentIds.length})`} defaultOpen>
        {group.memberComponentIds.length === 0 ? (
          <p className="sa-inspector__empty">{EMPTY_GROUP_TEXT}</p>
        ) : (
          <ul className="sa-member-list">
            {group.memberComponentIds.map((memberId) => {
              const name = componentName(architecture, memberId);
              return (
                <li key={memberId} className="sa-member-list__item">
                  <button
                    type="button"
                    className="sa-member-list__name sa-link-button"
                    onClick={() => commands.selectComponent(memberId)}
                  >
                    {name}
                  </button>
                  <Button
                    size="compact"
                    variant="ghost"
                    aria-label={`Remove from group: ${name}`}
                    onClick={() =>
                      commands.dispatch({ kind: "assignToGroup", componentIds: [memberId], groupId: null })
                    }
                  >
                    Remove from group
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </InspectorSection>
      <InspectorSection title="Documentation">
        <NotesField
          value={group.notes}
          onChange={(value) => update("notes", value)}
          onBlur={commands.breakCoalescing}
        />
      </InspectorSection>
      <InspectorFooter>
        <Button variant="destructive-outline" onClick={() => commands.run("deleteSelection")}>
          Delete group (keeps members)
        </Button>
      </InspectorFooter>
    </>
  );
}
