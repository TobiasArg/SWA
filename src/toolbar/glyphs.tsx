import type { SVGProps } from "react";

/**
 * Toolbar and panel glyphs that `ui/icons.tsx` does not provide, drawn in the same
 * 24-unit, 1.7-stroke style so they sit next to the shared icons.
 */
export type GlyphName =
  | "back"
  | "undo"
  | "redo"
  | "group"
  | "ungroup"
  | "connect"
  | "trash"
  | "export"
  | "import"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right";

const PATHS: Record<GlyphName, string[]> = {
  back: ["M15 5l-7 7 7 7"],
  undo: ["M9 14L4 9l5-5", "M4 9h10.5a5.5 5.5 0 010 11H11"],
  redo: ["M15 14l5-5-5-5", "M20 9H9.5a5.5 5.5 0 000 11H13"],
  group: ["M4 7V5a1 1 0 011-1h2", "M17 4h2a1 1 0 011 1v2", "M20 17v2a1 1 0 01-1 1h-2", "M7 20H5a1 1 0 01-1-1v-2", "M8 9h8v6H8z"],
  ungroup: ["M4 7V5a1 1 0 011-1h2", "M20 17v2a1 1 0 01-1 1h-2", "M7 8h5v5H7z", "M12 11h5v5h-5z"],
  connect: ["M6 6.5a2.5 2.5 0 100 .01", "M18 17.5a2.5 2.5 0 100 .01", "M8 8l8 8", "M16 11v5h-5"],
  trash: ["M4 7h16", "M9 7V4h6v3", "M6 7l1 13h10l1-13", "M10 11v6", "M14 11v6"],
  export: ["M12 15V4", "M7.5 8.5L12 4l4.5 4.5", "M5 14v5a1 1 0 001 1h12a1 1 0 001-1v-5"],
  import: ["M12 4v11", "M7.5 10.5L12 15l4.5-4.5", "M5 14v5a1 1 0 001 1h12a1 1 0 001-1v-5"],
  "chevron-down": ["M6 9l6 6 6-6"],
  "chevron-left": ["M15 6l-6 6 6 6"],
  "chevron-right": ["M9 6l6 6-6 6"],
};

export interface GlyphProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: GlyphName;
  size?: number;
}

export function Glyph({ name, size = 16, ...svgProps }: GlyphProps) {
  return (
    <svg
      {...svgProps}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
