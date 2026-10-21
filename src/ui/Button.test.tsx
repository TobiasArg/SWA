import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("defaults to a non-submit secondary button", () => {
    render(<Button>Save</Button>);

    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("type", "button");
    expect(screen.getByRole("button", { name: "Save" })).toHaveClass("sa-button--secondary");
  });

  it("applies the requested variant and compact icon sizing", () => {
    render(
      <Button variant="destructive-outline" size="compact" iconOnly aria-label="Delete">
        ×
      </Button>,
    );

    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass(
      "sa-button--destructive-outline",
      "sa-button--compact",
      "sa-button--icon-only",
    );
  });
});
