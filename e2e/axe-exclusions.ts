export interface AxeExclusion {
  rule: string;
  selector: string;
  reason: string;
  owner: string;
}

/** Every exception must be narrow, explained, and assigned to an owner. */
export const axeExclusions: readonly AxeExclusion[] = [];
