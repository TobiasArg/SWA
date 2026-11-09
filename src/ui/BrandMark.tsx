/**
 * The product mark "Abeja Bit": a 16 x 16 pixel bee in profile with a blue abdomen, shown on
 * a neutral white tile as the apple-touch icon. The ink is split in two so
 * the stripes (enclosed by the abdomen) and the body (head, thorax, antenna, legs, stinger) can be
 * recoloured separately for dark favicons and forced colors. Keep in sync with
 * public/favicon.svg, index.html (#lp-logo) and scripts/build-brand-icons.mjs.
 */
export const BRAND_MARK_PATHS = {
  wing: "M9 2h2v1h-2zM3 3h4v1h-4zM8 3h4v1h-4zM2 4h6v1h-6zM9 4h3v1h-3zM3 5h5v1h-5zM9 5h2v1h-2zM6 6h4v1h-4z",
  abdomen:
    "M15 5h1v1h-1zM2 7h1v1h-1zM4 7h2v1h-2zM1 8h2v1h-2zM4 8h2v1h-2zM7 8h1v1h-1zM1 9h2v1h-2zM4 9h2v1h-2zM7 9h1v1h-1zM1 10h2v1h-2zM4 10h2v1h-2zM7 10h1v1h-1zM2 11h1v1h-1zM4 11h2v1h-2z",
  stripe: "M3 7h1v5h-1zM6 7h1v5h-1z",
  body: "M14 6h1v1h-1zM9 7h2v1h-2zM12 7h2v1h-2zM8 8h3v1h-3zM12 8h1v1h-1zM14 8h1v1h-1zM0 9h1v1h-1zM8 9h7v1h-7zM8 10h3v1h-3zM12 10h2v1h-2zM9 11h2v1h-2zM8 12h1v1h-1zM10 12h1v1h-1z",
} as const;

/** Whole multiples of the 16 px grid only: anything else lands cells on half pixels and blurs. */
export type BrandMarkSize = 16 | 32 | 48 | 64;

export interface BrandMarkProps {
  size?: BrandMarkSize;
  className?: string;
}

/** Always decorative: the adjacent "Swarm Architecturer" text carries the name. */
export function BrandMark({ size = 16, className }: BrandMarkProps) {
  return (
    <svg
      className={className ? `sa-brand-mark ${className}` : "sa-brand-mark"}
      viewBox="0 0 16 16"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <g shapeRendering="crispEdges">
        <path className="sa-brand-mark__wing" d={BRAND_MARK_PATHS.wing} />
        <path className="sa-brand-mark__abdomen" d={BRAND_MARK_PATHS.abdomen} />
        <path className="sa-brand-mark__stripe" d={BRAND_MARK_PATHS.stripe} />
        <path className="sa-brand-mark__body" d={BRAND_MARK_PATHS.body} />
      </g>
    </svg>
  );
}
