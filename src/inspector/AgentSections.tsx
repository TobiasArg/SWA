import type { AgentBehavior, Component } from "../domain/types";
import { ListField } from "./fields/ListField";
import { TextAreaField } from "./fields/TextField";
import { InspectorSection } from "./InspectorHeader";
import { useInspectorCommands } from "./inspectorContext";

type TextBehaviorKey = "purpose" | "role" | "activation" | "delegation" | "outputs" | "failureHandling";
type ListBehaviorKey = "responsibilities" | "boundaries" | "rules";

function useBehaviorFields(component: Component) {
  const commands = useInspectorCommands();
  const behavior: AgentBehavior = component.behavior ?? {};

  function text(key: TextBehaviorKey, label: string) {
    return (
      <TextAreaField
        label={label}
        value={behavior[key]}
        onChange={(value) =>
          commands.dispatch(
            { kind: "updateBehavior", id: component.id, patch: { [key]: value } },
            `${component.id}:behavior.${key}`,
          )
        }
        onBlur={commands.breakCoalescing}
      />
    );
  }

  function list(key: ListBehaviorKey, label: string) {
    return (
      <ListField
        label={label}
        value={behavior[key]}
        onChange={(value) =>
          commands.dispatch(
            { kind: "updateBehavior", id: component.id, patch: { [key]: value } },
            `${component.id}:behavior.${key}`,
          )
        }
        onBlur={commands.breakCoalescing}
      />
    );
  }

  return { text, list };
}

/** Purpose and Role: rendered inside Identity, as two separate fields (TD 7.1). */
export function AgentIdentityFields({ component }: { component: Component }) {
  const { text } = useBehaviorFields(component);
  return (
    <>
      {text("purpose", "Purpose")}
      {text("role", "Role")}
    </>
  );
}

export function AgentSections({ component }: { component: Component }) {
  const { text, list } = useBehaviorFields(component);
  return (
    <>
      <InspectorSection title="Responsibilities">
        {list("responsibilities", "Responsibilities")}
        {list("boundaries", "Boundaries")}
      </InspectorSection>
      <InspectorSection title="Behavior">
        {text("activation", "Activation")}
        {list("rules", "Behavioral rules")}
        {text("delegation", "Delegation")}
        {text("outputs", "Outputs")}
        {text("failureHandling", "Failure handling")}
      </InspectorSection>
    </>
  );
}
