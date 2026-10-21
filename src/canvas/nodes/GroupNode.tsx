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
 */
function GroupNodeView({ data, selected, width, height }: NodeProps<GroupFlowNode>) {
  const { group } = data;
  const w = Math.max(0, width ?? group.bounds.width);
  const h = Math.max(0, height ?? group.bounds.height);
  return (
    <div className="sa-group" data-selected={selected ? "true" : undefined}>
      <svg className="sa-group__outline" aria-hidden="true" focusable="false">
        <rect className="sa-group__outline-hit" x="0" y="0" width={w} height={h} rx="8" />
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
