import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ARRANGE_NOTE, ArrangeMenu, type ArrangeMenuProps } from "./ArrangeMenu";

const ITEM_LABELS = [
  "Align left",
  "Align centers",
  "Align right",
  "Align top",
  "Align middles",
  "Align bottom",
  "Distribute horizontally",
  "Distribute vertically",
  "Tidy layout",
];

function renderMenu(overrides: Partial<ArrangeMenuProps> = {}) {
  const props: ArrangeMenuProps = {
    selectionUnits: 3,
    tidyScope: { kind: "selection", unitCount: 3 },
    onAlign: vi.fn(),
    onDistribute: vi.fn(),
    onTidy: vi.fn(),
    ...overrides,
  };
  const user = userEvent.setup();
  render(
    <>
      <ArrangeMenu {...props} />
      <button type="button">Outside</button>
    </>,
  );
  return { props, user, trigger: screen.getByRole("button", { name: "Arrange" }) };
}

const item = (name: string) => screen.getByRole("menuitem", { name });

describe("ArrangeMenu", () => {
  it("opens a labelled menu with the items in order, separators and the positions-only note", async () => {
    const { user, trigger } = renderMenu();
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).toBeNull();

    await user.click(trigger);

    const menu = screen.getByRole("menu", { name: "Arrange" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("aria-controls", menu.id);
    // Accessible names are the labels alone; hints are descriptions.
    for (const [index, element] of screen.getAllByRole("menuitem").entries()) {
      expect(element).toHaveAccessibleName(ITEM_LABELS[index]);
    }
    expect(screen.getAllByRole("menuitem")).toHaveLength(ITEM_LABELS.length);
    expect(screen.getAllByRole("separator")).toHaveLength(3);
    expect(menu).toHaveAccessibleDescription(ARRANGE_NOTE);
    expect(ARRANGE_NOTE).toMatch(/positions only/);
    expect(ARRANGE_NOTE).toMatch(/Relationships and groups are unchanged/);
    expect(item("Align left")).toHaveFocus();
  });

  it("moves focus with the arrow keys, Home and End, wrapping around", async () => {
    const { user, trigger } = renderMenu();
    await user.click(trigger);

    await user.keyboard("{ArrowDown}");
    expect(item("Align centers")).toHaveFocus();
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(item("Tidy layout")).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(item("Align left")).toHaveFocus();
    await user.keyboard("{End}");
    expect(item("Tidy layout")).toHaveFocus();
    await user.keyboard("{Home}");
    expect(item("Align left")).toHaveFocus();
    // Menu items are not Tab stops (roving focus).
    for (const element of screen.getAllByRole("menuitem")) expect(element).toHaveAttribute("tabindex", "-1");
  });

  it("opens from the keyboard on the trigger, ArrowUp focusing the last item", async () => {
    const { user, trigger } = renderMenu();
    trigger.focus();
    await user.keyboard("{ArrowUp}");
    expect(item("Tidy layout")).toHaveFocus();
    await user.keyboard("{Escape}");
    await user.keyboard("{ArrowDown}");
    expect(item("Align left")).toHaveFocus();
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const { user, trigger } = renderMenu();
    await user.click(trigger);
    await user.keyboard("{ArrowDown}{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("closes on Tab and on a pointer press outside", async () => {
    const { user, trigger } = renderMenu();
    await user.click(trigger);
    await user.keyboard("{Tab}");
    expect(screen.queryByRole("menu")).toBeNull();

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("runs the chosen action once, closes and refocuses the trigger", async () => {
    const { user, trigger, props } = renderMenu();
    await user.click(trigger);
    await user.click(item("Align middles"));
    expect(props.onAlign).toHaveBeenCalledExactlyOnceWith("middles");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.keyboard("{End}{ArrowUp}{Enter}");
    expect(props.onDistribute).toHaveBeenCalledExactlyOnceWith("vertical");

    await user.click(trigger);
    await user.keyboard("{End}{Enter}");
    expect(props.onTidy).toHaveBeenCalledTimes(1);
  });

  it("enables align but not distribute for two units, skipping disabled items with a hint", async () => {
    const { user, trigger, props } = renderMenu({ selectionUnits: 2, tidyScope: { kind: "selection", unitCount: 2 } });
    await user.click(trigger);

    for (const name of ITEM_LABELS.slice(0, 6)) expect(item(name)).toBeEnabled();
    for (const name of ["Distribute horizontally", "Distribute vertically"]) {
      expect(item(name)).toBeDisabled();
      expect(item(name)).toHaveAccessibleDescription("Select 3 or more");
    }
    expect(item("Tidy layout")).toBeEnabled();
    expect(item("Tidy layout")).toHaveAccessibleDescription("Selection only; may overlap other items");

    await user.keyboard("{End}{ArrowUp}");
    expect(item("Align bottom")).toHaveFocus();
    await user.click(item("Distribute horizontally"));
    expect(props.onDistribute).not.toHaveBeenCalled();
  });

  it("disables align and distribute for a single unit, keeping the accessible name to the label", async () => {
    const { user, trigger } = renderMenu({ selectionUnits: 1, tidyScope: { kind: "selection", unitCount: 1 } });
    await user.click(trigger);

    for (const name of ITEM_LABELS.slice(0, 6)) {
      expect(item(name)).toBeDisabled();
      expect(item(name)).toHaveAccessibleDescription("Select 2 or more");
    }
    expect(item("Tidy layout")).toBeDisabled();
    expect(item("Tidy layout")).toHaveAccessibleDescription("Select 2 or more, or clear the selection");
  });

  it("offers Tidy for the whole diagram when nothing is selected", async () => {
    const { user, trigger } = renderMenu({ selectionUnits: 0, tidyScope: { kind: "diagram", unitCount: 4 } });
    await user.click(trigger);

    expect(item("Tidy layout")).toBeEnabled();
    expect(item("Tidy layout")).toHaveAccessibleDescription("Whole diagram");
    expect(item("Tidy layout")).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(item("Tidy layout")).toHaveFocus();
  });

  it("keeps Escape working when every item is disabled", async () => {
    const { user, trigger } = renderMenu({ selectionUnits: 0, tidyScope: { kind: "diagram", unitCount: 1 } });
    await user.click(trigger);

    for (const element of screen.getAllByRole("menuitem")) expect(element).toBeDisabled();
    expect(item("Tidy layout")).toHaveAccessibleDescription("Add 2 or more items");
    expect(screen.getByRole("menu")).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });
});
