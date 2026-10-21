export type PortSide = "top" | "right" | "bottom" | "left";
export const PORT_SIDES: readonly PortSide[] = ["top", "right", "bottom", "left"];

export function isPortSide(value: unknown): value is PortSide {
  return typeof value === "string" && (PORT_SIDES as readonly string[]).includes(value);
}

export interface PortPins {
  source?: PortSide;
  target?: PortSide;
}

/**
 * Reads pinned ports from a relationship `visual` record. Anything that is not
 * a valid side counts as automatic; the stored value is never rewritten here.
 */
export function readPortPins(visual: Record<string, unknown> | undefined): PortPins {
  const ports = visual?.ports;
  if (ports === null || typeof ports !== "object" || Array.isArray(ports)) return {};
  const { source, target } = ports as Record<string, unknown>;
  return {
    ...(isPortSide(source) ? { source } : {}),
    ...(isPortSide(target) ? { target } : {}),
  };
}
