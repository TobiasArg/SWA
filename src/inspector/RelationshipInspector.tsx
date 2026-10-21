import { RELATIONSHIP_TYPES } from "../domain/constants";
import type { Architecture, Relationship, RelationshipType } from "../domain/types";
import { Button } from "../ui/Button";
import { Icon } from "../ui/icons";
import { SegmentedField } from "./fields/SegmentedField";
import { SelectField } from "./fields/SelectField";
import { TextAreaField, TextField } from "./fields/TextField";
import { InspectorFooter, InspectorHeader, InspectorSection } from "./InspectorHeader";
import { useInspectorCommands } from "./inspectorContext";
import { componentName, relationshipDisplayLabel } from "./relationships";

const TYPE_OPTIONS = (Object.keys(RELATIONSHIP_TYPES) as RelationshipType[]).map((type) => ({
  value: type,
  label: RELATIONSHIP_TYPES[type].label,
}));

const DIRECTION_OPTIONS = [
  { value: "directed", label: "Directed" },
  { value: "undirected", label: "Undirected" },
] as const;

export interface RelationshipInspectorProps {
  architecture: Architecture;
  relationship: Relationship;
}

export function RelationshipInspector({ architecture, relationship: rel }: RelationshipInspectorProps) {
  const commands = useInspectorCommands();
  const { id } = rel;
  const isGeneric = rel.type === "generic";
  // Undirected endpoints are listed by name so the stored order never reads as a direction.
  const [first, second] = [rel.sourceId, rel.targetId].sort((a, b) =>
    componentName(architecture, a).localeCompare(componentName(architecture, b)),
  ) as [string, string];

  function endpoint(componentId: string) {
    return (
      <button
        type="button"
        className="sa-link-button"
        onClick={() => commands.selectComponent(componentId)}
      >
        {componentName(architecture, componentId)}
      </button>
    );
  }

  return (
    <>
      <InspectorHeader kind="Relationship" title={relationshipDisplayLabel(rel)} />
      <InspectorSection title="Relationship" defaultOpen>
        <p className="sa-rel-sentence">
          {rel.direction === "directed" ? (
            <>
              <strong>From</strong> {endpoint(rel.sourceId)} <strong>to</strong> {endpoint(rel.targetId)}
            </>
          ) : (
            <>
              <strong>Between</strong> {endpoint(first)} <strong>and</strong> {endpoint(second)}
            </>
          )}
        </p>
        <SelectField
          label="Type"
          value={rel.type}
          options={TYPE_OPTIONS}
          onChange={(value) =>
            commands.dispatch({ kind: "retypeRelationship", id, type: value as RelationshipType })
          }
        />
        {isGeneric ? (
          <SegmentedField
            legend="Direction"
            value={rel.direction}
            options={DIRECTION_OPTIONS}
            onChange={(value) =>
              commands.dispatch({
                kind: "setRelationshipDirection",
                id,
                direction: value === "undirected" ? "undirected" : "directed",
              })
            }
          />
        ) : (
          <div className="sa-field">
            <span className="sa-field__label">Direction</span>
            <p className="sa-readonly">
              <Icon name="lock" />
              {rel.direction === "directed" ? "Directed" : "Undirected"} (fixed by type)
            </p>
          </div>
        )}
        {isGeneric && rel.direction === "directed" ? (
          <div>
            <Button onClick={() => commands.dispatch({ kind: "reverseRelationship", id })}>
              Reverse direction
            </Button>
          </div>
        ) : null}
        <TextField
          label="Label"
          value={rel.label}
          onChange={(label) =>
            commands.dispatch({ kind: "updateRelationship", id, patch: { label } }, `${id}:label`)
          }
          onBlur={commands.breakCoalescing}
        />
        <TextAreaField
          label="Description"
          value={rel.description}
          onChange={(description) =>
            commands.dispatch(
              { kind: "updateRelationship", id, patch: { description } },
              `${id}:description`,
            )
          }
          onBlur={commands.breakCoalescing}
        />
      </InspectorSection>
      <InspectorFooter>
        <Button variant="destructive-outline" onClick={() => commands.run("deleteSelection")}>
          Delete
        </Button>
      </InspectorFooter>
    </>
  );
}
