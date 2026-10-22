export type IdPrefix = "arch" | "cmp" | "rel" | "grp" | "snap";

export function createId(prefix: IdPrefix): string {
  return `${prefix}_${globalThis.crypto.randomUUID()}`;
}
