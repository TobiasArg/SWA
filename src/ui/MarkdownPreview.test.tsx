import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MarkdownPreview, { EMPTY_NOTES_TEXT } from "./MarkdownPreview";

describe("MarkdownPreview", () => {
  it("renders headings, lists and emphasis", () => {
    render(<MarkdownPreview source={"# Title\n\n- one\n- two\n\nSome *em* and **strong** and `code`."} />);

    expect(screen.getByRole("heading", { level: 1, name: "Title" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["one", "two"]);
    expect(screen.getByText("em").tagName).toBe("EM");
    expect(screen.getByText("strong").tagName).toBe("STRONG");
    expect(screen.getByText("code").tagName).toBe("CODE");
  });

  it("shows an empty state for missing or blank notes", () => {
    const { rerender } = render(<MarkdownPreview source={undefined} />);
    expect(screen.getByText(EMPTY_NOTES_TEXT)).toBeInTheDocument();
    rerender(<MarkdownPreview source={"   \n"} />);
    expect(screen.getByText(EMPTY_NOTES_TEXT)).toBeInTheDocument();
  });

  it("never renders raw HTML as live elements", () => {
    const source = [
      "<script>window.__pwned = true</script>",
      "",
      '<img src="x" onerror="window.__pwned = true">',
      "",
      '<iframe src="https://example.com"></iframe>',
      "",
      'Inline <b onclick="x()">bold</b> text',
    ].join("\n");
    const { container } = render(<MarkdownPreview source={source} />);

    expect(container.querySelector("script, iframe, img, b, [onerror], [onclick]")).toBeNull();
    expect((window as { __pwned?: boolean }).__pwned).toBeUndefined();
  });

  it("does not create links for unsafe protocols", () => {
    const { container } = render(
      <MarkdownPreview source={"[x](javascript:alert(1)) [y](data:text/html,hi) [z](vbscript:x)"} />,
    );

    expect(container.querySelector("a")).toBeNull();
    expect(container.innerHTML).not.toMatch(/javascript:|data:|vbscript:/);
    expect(screen.getByText("x")).toBeInTheDocument();
  });

  it("replaces images with a text placeholder and never loads them", () => {
    const { container } = render(<MarkdownPreview source={"![diagram](https://example.com/x.png)\n\n![](https://example.com/y.png)"} />);

    expect(container.querySelector("img")).toBeNull();
    expect(container.innerHTML).not.toContain("example.com");
    expect(screen.getByText("[image: diagram]")).toBeInTheDocument();
    expect(screen.getByText("[image]")).toBeInTheDocument();
  });

  it("renders safe links as new-tab links without opener access", () => {
    render(<MarkdownPreview source={"See [docs](https://example.com/docs) or [mail](mailto:a@example.com)."} />);

    const link = screen.getByRole("link", { name: "docs" });
    expect(link).toHaveAttribute("href", "https://example.com/docs");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: "mail" })).toHaveAttribute("href", "mailto:a@example.com");
  });
});
