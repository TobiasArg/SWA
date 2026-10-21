import type { Architecture, Selection } from "../domain/types";
import { useEditorState } from "../editor/context";
import type { EditorState } from "../editor/storeTypes";
import { ArchitectureInspector } from "./ArchitectureInspector";
import { ComponentInspector } from "./ComponentInspector";
import { GroupInspector } from "./GroupInspector";
import { InspectorActionsProvider, type InspectorActions } from "./inspectorContext";
import { MultiSelectionInspector } from "./MultiSelectionInspector";
import { RelationshipInspector } from "./RelationshipInspector";
import "./inspector.css";

export type { InspectorActions } from "./inspectorContext";

export interface InspectorProps {
  /** Wire to `editor/actions.ts` plus the canvas ConnectDialog opener. */
  actions: InspectorActions;
}

const selectArchitecture = (state: EditorState) => state.architecture;
const selectSelection = (state: EditorState) => state.selection;

function InspectorBody({ architecture, selection }: { architecture: Architecture; selection: Selection }) {
  const { componentIds, relationshipIds, groupIds } = selection;
  const total = componentIds.length + relationshipIds.length + groupIds.length;

  if (total > 1) {
    return <MultiSelectionInspector architecture={architecture} selection={selection} />;
  }

  // Keyed by ID so field drafts reset when the selection changes (TD 7).
  const component = architecture.components.find((candidate) => candidate.id === componentIds[0]);
  if (component) {
    return <ComponentInspector key={component.id} architecture={architecture} component={component} />;
  }
  const relationship = architecture.relationships.find((candidate) => candidate.id === relationshipIds[0]);
  if (relationship) {
    return (
      <RelationshipInspector key={relationship.id} architecture={architecture} relationship={relationship} />
    );
  }
  const group = architecture.groups.find((candidate) => candidate.id === groupIds[0]);
  if (group) {
    return <GroupInspector key={group.id} architecture={architecture} group={group} />;
  }
  return <ArchitectureInspector key={architecture.id} architecture={architecture} />;
}

/** Right panel (TD 7): architecture, single element or multi-selection inspector. */
export function Inspector({ actions }: InspectorProps) {
  const architecture = useEditorState(selectArchitecture);
  const selection = useEditorState(selectSelection);

  return (
    <InspectorActionsProvider actions={actions}>
      <section className="sa-inspector" aria-label="Inspector">
        <InspectorBody architecture={architecture} selection={selection} />
      </section>
    </InspectorActionsProvider>
  );
}

export default Inspector;
