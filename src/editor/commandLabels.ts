import type { Command } from "../domain/commands";

/** Undo labels for commands whose label should not fall back to the command kind. */
export const DEFAULT_COMMAND_LABELS: Partial<Record<Command["kind"], string>> = {
  restoreDiagram: "Restore version",
  setComponentAccent: "Change color",
  setRelationshipPorts: "Reset relationship ports",
};
