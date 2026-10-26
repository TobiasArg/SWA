import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { Icon } from "../../ui/icons";
import { GROUP_DRAG_HANDLE_CLASS, type GroupFlowNode } from "../flowTypes";

export function memberCountLabel(count: number): string {
  if (count === 0) return "EMPTY";
  return count === 1 ? "1 MEMBER" : `${count} MEMBERS`;
}

/**
 * A group container (UI handoff 5.4, TD 6.5). The node wrapper and the body
 * ignore pointer events so clicks and box selection inside the group reach the
 * pane, edges and components. Only the header (the React Flow `dragHandle`) and
 * the outline stroke are interactive. Groups have no handles and no resizer.
 *
 * Next to the extruded (2.5D) components a group reads as a shallow sunken
 * tray: a faint inner shadow along its top and left walls (light from the
 * top-left, like the component side faces). It is decoration only: flat
 * geometry, no pointer events, and the group box (and its export bounds) is unchanged.
 */
function trayInsetPath(w: number, h: number): string {
  const i = 3; // inset from the box edge: just inside the 1.5 px dashed outline
  const r = 5; // concentric with the outline (rx 7 at 1 px)
  if (w < 2 * (i + r) || h < 2 * (i + r)) return "";
  return `M${i},${h - i - r} V${i + r} A${r},${r} 0 0 1 ${i + r},${i} H${w - i - r}`;
}

function GroupNodeView({ data, selected, width, height }: NodeProps<GroupFlowNode>) {
  const { group } = data;
  const w = Math.max(0, width ?? group.bounds.width);
  const h = Math.max(0, height ?? group.bounds.height);
  return (
    <div className="sa-group" data-selected={selected ? "true" : undefined}>
      <svg className="sa-group__outline" aria-hidden="true" focusable="false">
        <rect className="sa-group__outline-hit" x="0" y="0" width={w} height={h} rx="8" />
        <path className="sa-group__inset" d={trayInsetPath(w, h)} />
        <rect
          className="sa-group__outline-stroke"
          x="1"
          y="1"
          width={Math.max(0, w - 2)}
          height={Math.max(0, h - 2)}
          rx="7"
        />
      </svg>
      <div className={`${GROUP_DRAG_HANDLE_CLASS} sa-group__header`}>
        <Icon name="grip" size={16} className="sa-group__grip" />
        <span className="sa-group__name">{group.name}</span>
        <span className="sa-group__count">{memberCountLabel(group.memberComponentIds.length)}</span>
      </div>
    </div>
  );
}

export const GroupNode = memo(GroupNodeView);
