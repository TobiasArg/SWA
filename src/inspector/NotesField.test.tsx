import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { fixture, renderInspector } from "./testStore";

function withNotes(componentNotes?: string, groupNotes?: string) {
  const architecture = fixture();
  architecture.components = architecture.components.map((c) =>
    c.id === "cmp_tool" && componentNotes !== undefined ? { ...c, notes: componentNotes } : c,
  );
  architecture.groups = architecture.groups.map((g) =>
    g.id === "grp_a" && groupNotes !== undefined ? { ...g, notes: groupNotes } : g,
  );
  return architecture;
}

function toggle() {
  const group = screen.getByRole("group", { name: "Notes view" });
  return {
    edit: within(group).getByRole("button", { name: "Edit" }),
    preview: within(group).getByRole("button", { name: "Preview" }),
  };
}

describe("Notes Edit / Preview", () => {
  it("defaults to Edit with a labelled textarea", () => {
    renderInspector(withNotes("Hello"), { componentIds: ["cmp_tool"] });

    expect(screen.getByLabelText("Notes")).toHaveValue("Hello");
    expect(toggle().edit).toHaveAttribute("aria-pressed", "true");
    expect(toggle().preview).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("region", { name: "Notes preview" })).toBeNull();
  });

  it("previews component notes and returns to Edit with the draft intact", async () => {
    const user = userEvent.setup();
    const { store } = renderInspector(withNotes(""), { componentIds: ["cmp_tool"] });

    await user.type(screen.getByLabelText("Notes"), "## Plan{enter}{enter}- first");
    await user.click(toggle().preview);

    const region = screen.getByRole("region", { name: "Notes preview" });
    expect(await within(region).findByRole("heading", { name: "Plan" })).toBeInTheDocument();
    expect(within(region).getByRole("listitem")).toHaveTextContent("first");
    expect(screen.queryByRole("textbox", { name: "Notes" })).toBeNull();
    expect(toggle().preview).toHaveAttribute("aria-pressed", "true");

    await user.click(toggle().edit);
    expect(screen.getByLabelText("Notes")).toHaveValue("## Plan\n\n- first");
    const keys = new Set(store.dispatched.map((entry) => entry.coalesceKey));
    expect(keys).toEqual(new Set(["cmp_tool:notes"]));
  });

  it("previews group notes", async () => {
    const user = userEvent.setup();
    renderInspector(withNotes(undefined, "Team **notes**"), { groupIds: ["grp_a"] });

    await user.click(toggle().preview);
    const region = screen.getByRole("region", { name: "Notes preview" });
    expect((await within(region).findByText("notes")).tagName).toBe("STRONG");

    await user.click(toggle().edit);
    expect(screen.getByLabelText("Notes")).toHaveValue("Team **notes**");
  });

  it("shows an empty state when there are no notes", async () => {
    const user = userEvent.setup();
    renderInspector(withNotes(), { componentIds: ["cmp_tool"] });

    await user.click(toggle().preview);
    expect(await screen.findByText("No notes yet.")).toBeInTheDocument();
  });

  it("is operable from the keyboard and keeps focus on the toggle", async () => {
    const user = userEvent.setup();
    renderInspector(withNotes("*hi*"), { componentIds: ["cmp_tool"] });

    screen.getByLabelText("Notes").focus();
    await user.tab({ shift: true });
    expect(toggle().preview).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("region", { name: "Notes preview" })).toBeInTheDocument();
    expect(toggle().preview).toHaveFocus();

    await user.tab({ shift: true });
    expect(toggle().edit).toHaveFocus();
    await user.keyboard(" ");
    expect(screen.getByLabelText("Notes")).toHaveValue("*hi*");
    expect(toggle().edit).toHaveFocus();
  });
});
