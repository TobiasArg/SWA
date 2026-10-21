import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { announce, LiveRegion } from "./LiveRegion";

describe("LiveRegion", () => {
  it("announces updates, including a repeated message", () => {
    render(<LiveRegion />);

    act(() => announce("Saved."));
    expect(screen.getByText("Saved.")).toBeInTheDocument();
    const firstAnnouncement = screen.getByText("Saved.");

    act(() => announce("Saved."));

    expect(screen.getByText("Saved.")).toBeInTheDocument();
    expect(screen.getByText("Saved.")).not.toBe(firstAnnouncement);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });
});
