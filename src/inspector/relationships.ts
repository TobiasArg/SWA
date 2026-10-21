import type { Architecture } from "../domain/types";

export {
  describeRelationship,
  getGroupOfComponent,
  getRelationshipsOf,
  relationshipDisplayLabel,
} from "../domain/selectors";

export function componentName(a: Architecture, id: string): string {
  return a.components.find((component) => component.id === id)?.name ?? "Unknown component";
}
