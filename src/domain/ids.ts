export type IdPrefix = "arch" | "cmp" | "rel" | "grp";

export function createId(prefix: IdPrefix): string {
  return `${prefix}_${globalThis.crypto.randomUUID()}`;
}
