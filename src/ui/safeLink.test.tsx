import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { isSafeLink, SafeLink } from "./safeLink";

describe("isSafeLink", () => {
  it.each(["https://example.com", "http://example.com/path", "mailto:help@example.com"])(
    "accepts explicitly supported URL %s",
    (url) => {
      expect(isSafeLink(url)).toBe(true);
    },
  );

  it.each(["javascript:alert(1)", "data:text/html,hello", "file:///tmp/document", "/relative/path", "invalid"])(
    "rejects URL %s",
    (url) => {
      expect(isSafeLink(url)).toBe(false);
    },
  );
});

describe("SafeLink", () => {
  it("opens supported links in a new tab with a safe rel value", () => {
    render(<SafeLink url="https://example.com">Documentation</SafeLink>);

    expect(screen.getByRole("link", { name: "Documentation" })).toHaveAttribute(
      "href",
      "https://example.com",
    );
    expect(screen.getByRole("link")).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link")).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders unsafe values as plain text rather than an anchor", () => {
    render(<SafeLink url="javascript:alert(1)">External reference</SafeLink>);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("External reference").tagName).toBe("SPAN");
  });
});
