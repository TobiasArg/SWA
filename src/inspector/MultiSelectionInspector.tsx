import { useId } from "react";
import { ACCENTS, type AccentId } from "../domain/constants";
import { typePaletteId } from "../domain/palette";
import type { Architecture, Component, Selection } from "../domain/types";
import { Button } from "../ui/Button";
import { announce } from "../ui/LiveRegion";
import { AccentRadioGroup, DEFAULT_USAGE_KEY, TYPE_DEFAULT_LABEL, accentCaption, type AccentUsageKey } from "./AccentPicker";
import { count } from "./ArchitectureInspector";
import { InspectorFooter, InspectorHeader, InspectorSection } from "./InspectorHeader";
import { useInspectorCommands } from "./inspectorContext";
import { getGroupOfComponent } from "./relationships";

export interface MultiSelectionInspectorProps {
  architecture: Architecture;
  selection: Selection;
}

interface MultiColorSectionProps {
  components: Component[];
  /** Groups or relationships are selected too; they never take a color. */
  hasUncolored: boolean;
}

/**
 * Color for every selected component (Roadmap v2 §4.1). A uniform value checks its
 * radio; differing values check none and show "Mixed" plus usage marks. Each choice
 * is one `setComponentAccent` over the selected components only (one undo entry).
 */
function MultiColorSection({ components, hasUncolored }: MultiColorSectionProps) {
  const commands = useInspectorCommands();
  const name = useId();
  const ids = components.map((component) => component.id);
  const total = components.length;

  const usage = new Map<AccentUsageKey, number>();
  for (const { accent } of components) {
    const key = accent ?? DEFAULT_USAGE_KEY;
    usage.set(key, (usage.get(key) ?? 0) + 1);
  }
  const [first] = usage.keys();
  const uniform = usage.size === 1 ? (first === DEFAULT_USAGE_KEY ? undefined : (first as AccentId)) : "mixed";
  const typePalettes = new Set(components.map(typePaletteId));
  const [sharedTypePalette] = typePalettes;

  function choose(accent: AccentId | undefined) {
    if (commands.dispatch({ kind: "setComponentAccent", ids, accent })) {
      announce(`Changed color of ${count(total, "component")} to ${accent ? ACCENTS[accent].label : TYPE_DEFAULT_LABEL}.`);
    }
  }

  return (
    <InspectorSection title="Color" defaultOpen>
      <p className="sa-multi__summary">
        {`Applies to ${count(total, "selected component")}.`}
        {hasUncolored ? " Groups and relationships have no color." : null}
      </p>
      <AccentRadioGroup
        name={name}
        value={uniform}
        defaultPaletteId={typePalettes.size === 1 ? sharedTypePalette! : null}
        usage={usage}
        total={total}
        caption={uniform === "mixed" ? `Color: Mixed (${usage.size} colors)` : accentCaption(uniform)}
        onChoose={choose}
      />
    </InspectorSection>
  );
}

export function MultiSelectionInspector({ architecture, selection }: MultiSelectionInspectorProps) {
  const commands = useInspectorCommands();
  const { componentIds, relationshipIds, groupIds } = selection;
  const hasComponents = componentIds.length > 0;
  const groupedIds = componentIds.filter((id) => getGroupOfComponent(architecture, id));
  const selectedComponents = componentIds.flatMap((id) => architecture.components.find((c) => c.id === id) ?? []);
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
      {selectedComponents.length > 0 ? (
        <MultiColorSection
          components={selectedComponents}
          hasUncolored={relationshipIds.length > 0 || groupIds.length > 0}
        />
      ) : null}
      <InspectorFooter>
        <Button variant="destructive-outline" onClick={() => commands.run("deleteSelection")}>
          Delete
        </Button>
      </InspectorFooter>
    </>
  );
}
