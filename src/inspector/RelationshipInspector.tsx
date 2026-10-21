import { useRef } from "react";
import { RELATIONSHIP_TYPES } from "../domain/constants";
import { readPortPins, type PortSide } from "../domain/ports";
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

function portText(side: PortSide | undefined): string {
  return side ? `${side.charAt(0).toUpperCase()}${side.slice(1)} side` : "Automatic";
}

/**
 * Read-only ports row (UI v2 §8.6). Component names are listed source first,
 * without an arrow, so undirected order never reads as a direction.
 */
export function portsRowText(architecture: Architecture, rel: Relationship): string {
  const pins = readPortPins(rel.visual);
  return (
    `${componentName(architecture, rel.sourceId)}: ${portText(pins.source)} · ` +
    `${componentName(architecture, rel.targetId)}: ${portText(pins.target)}`
  );
}

export interface RelationshipInspectorProps {
  architecture: Architecture;
  relationship: Relationship;
}

export function RelationshipInspector({ architecture, relationship: rel }: RelationshipInspectorProps) {
  const commands = useInspectorCommands();
  const { id } = rel;
  const isGeneric = rel.type === "generic";
  const portsRef = useRef<HTMLParagraphElement>(null);
  // Only valid pins count: malformed `visual.ports` already renders as automatic.
  const pins = readPortPins(rel.visual);
  const hasPins = pins.source !== undefined || pins.target !== undefined;

  function resetPorts() {
    if (!commands.dispatch({ kind: "setRelationshipPorts", id, ports: null })) return;
    portsRef.current?.focus();
  }
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
        <div className="sa-field">
          <span className="sa-field__label">Ports</span>
          <p ref={portsRef} className="sa-readonly sa-ports-row" tabIndex={-1}>
            {portsRowText(architecture, rel)}
          </p>
          {hasPins ? (
            <div>
              <Button onClick={resetPorts}>Reset ports to automatic</Button>
            </div>
          ) : null}
        </div>
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
