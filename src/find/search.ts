import { COMPONENT_TYPE_LABELS } from "../domain/constants";
import type { Architecture, Component } from "../domain/types";

export interface ComponentSearchResult {
  component: Component;
  groupName?: string;
  /** Matching spans in the original component name, as end-exclusive UTF-16 offsets. */
  ranges: Array<[start: number, end: number]>;
}

export interface ComponentSearchResults {
  results: ComponentSearchResult[];
  /** Number of matches before applying the limit. */
  total: number;
}

function normalize(text: string): string {
  return text.normalize("NFD").toLowerCase().replace(/\p{M}/gu, "");
}

/** Keep offsets into the original string, including decomposed combining marks. */
function normalizeName(name: string) {
  const offsets: Array<[number, number]> = [];
  let start = 0;
  for (const character of name) {
    const end = start + character.length;
    const normalized = normalize(character);
    for (let index = 0; index < normalized.length; index += 1) {
      offsets.push([start, end]);
    }
    if (!normalized && offsets.length > 0) {
      offsets[offsets.length - 1]![1] = end;
    }
    start = end;
  }
  return { text: normalize(name), offsets };
}

/** Text-only Quick Find: neither relationships nor component/group geometry is read. */
export function searchComponents(
  architecture: Architecture,
  query: string,
  limit = 50,
): ComponentSearchResults {
  const needle = normalize(query.trim());
  const groupNames = new Map<string, string>();
  for (const group of architecture.groups) {
    for (const id of group.memberComponentIds) groupNames.set(id, group.name);
  }

  const matches: Array<ComponentSearchResult & { rank: number }> = [];
  for (const component of architecture.components) {
    const groupName = groupNames.get(component.id);
    const { text: name, offsets } = normalizeName(component.name);
    const ranges: Array<[number, number]> = [];
    let wordPrefix = false;
    if (needle) {
      let index = name.indexOf(needle);
      while (index !== -1) {
        const precedingCharacter = Array.from(name.slice(0, index)).at(-1);
        if (!precedingCharacter || !/[\p{L}\p{N}]/u.test(precedingCharacter)) {
          wordPrefix = true;
        }
        ranges.push([offsets[index]![0], offsets[index + needle.length - 1]![1]]);
        index = name.indexOf(needle, index + needle.length);
      }
    }

    let rank: number;
    if (!needle || name === needle) rank = 0;
    else if (name.startsWith(needle)) rank = 1;
    else if (wordPrefix) rank = 2;
    else if (ranges.length > 0) rank = 3;
    else if (
      normalize(COMPONENT_TYPE_LABELS[component.type]).includes(needle) ||
      (groupName !== undefined && normalize(groupName).includes(needle))
    ) rank = 4;
    else continue;

    matches.push({
      component,
      ...(groupName === undefined ? {} : { groupName }),
      ranges,
      rank,
    });
  }

  matches.sort((a, b) =>
    a.rank - b.rank ||
    a.component.name.localeCompare(b.component.name) ||
    a.component.id.localeCompare(b.component.id),
  );
  const count = Number.isNaN(limit) ? 0 : Math.max(0, Math.floor(limit));
  return {
    results: matches.slice(0, count).map(({ component, groupName, ranges }) => ({
      component,
      ...(groupName === undefined ? {} : { groupName }),
      ranges,
    })),
    total: matches.length,
  };
}
