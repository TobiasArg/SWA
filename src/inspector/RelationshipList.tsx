import { RELATIONSHIP_TYPES } from "../domain/constants";
import type { Architecture, Relationship, RelationshipType } from "../domain/types";
import { Button } from "../ui/Button";
import { useInspectorCommands } from "./inspectorContext";
import { componentName, describeRelationship, getRelationshipsOf } from "./relationships";

export interface RelationshipListProps {
  architecture: Architecture;
  componentId: string;
}

type Role = "outgoing" | "incoming" | "undirected";

const GLYPH: Record<Role, string> = { outgoing: "→", incoming: "←", undirected: "↔" };

interface Entry {
  rel: Relationship;
  role: Role;
  otherId: string;
}

export const EMPTY_RELATIONSHIPS_TEXT =
  "No relationships yet. Drag from a node's edge handle to another component, or use Connect…";

/**
 * Read-only list of the component's relationships (TD 7.4). It never creates,
 * edits or deletes; entries only change the selection.
 */
export function RelationshipList({ architecture, componentId }: RelationshipListProps) {
  const commands = useInspectorCommands();
  const { outgoing, incoming, undirected } = getRelationshipsOf(architecture, componentId);
  const entries: Entry[] = [
    ...outgoing.map((rel) => ({ rel, role: "outgoing" as const, otherId: rel.targetId })),
    ...incoming.map((rel) => ({ rel, role: "incoming" as const, otherId: rel.sourceId })),
    ...undirected.map((rel) => ({
      rel,
      role: "undirected" as const,
      otherId: rel.sourceId === componentId ? rel.targetId : rel.sourceId,
    })),
  ];

  if (entries.length === 0) {
    return <p className="sa-inspector__empty">{EMPTY_RELATIONSHIPS_TEXT}</p>;
  }

  const types = (Object.keys(RELATIONSHIP_TYPES) as RelationshipType[]).filter((type) =>
    entries.some((entry) => entry.rel.type === type),
  );

  return (
    <div className="sa-rel-list">
      {types.map((type) => (
        <section key={type} className="sa-rel-list__group" aria-label={RELATIONSHIP_TYPES[type].label}>
          <h4 className="sa-rel-list__heading">{RELATIONSHIP_TYPES[type].label}</h4>
          <ul className="sa-rel-list__items">
            {entries
              .filter((entry) => entry.rel.type === type)
              .map(({ rel, role, otherId }) => {
                const otherName = componentName(architecture, otherId);
                return (
                  <li key={rel.id} className="sa-rel-list__item">
                    <button
                      type="button"
                      className="sa-rel-list__open"
                      aria-label={`Open relationship: ${describeRelationship(architecture, rel)}`}
                      onClick={() => commands.selectRelationship(rel.id)}
                    >
                      <span className="sa-rel-list__glyph" aria-hidden="true">
                        {GLYPH[role]}
                      </span>
                      <span className="sa-rel-list__name">{otherName}</span>
                      {rel.label ? <span className="sa-rel-list__label">{rel.label}</span> : null}
                    </button>
                    <Button
                      variant="ghost"
                      size="compact"
                      iconOnly
                      className="sa-rel-list__goto"
                      aria-label={`Go to ${otherName}`}
                      title={`Go to ${otherName}`}
                      onClick={() => commands.selectComponent(otherId)}
                    >
                      <span aria-hidden="true">⇥</span>
                    </Button>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}
