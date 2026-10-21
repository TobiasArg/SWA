import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";
import App from "./App";
import { installDialogPolyfill } from "./testUtils";

beforeAll(() => {
  installDialogPolyfill();
  // React Flow measures its container; jsdom has no ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

describe("App with the real modules (IndexedDB via fake-indexeddb)", () => {
  it("creates an architecture, edits it in the editor and finds it in the library after leaving", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "#/");
    const { unmount } = render(<App />);

    await user.click(await screen.findByRole("button", { name: "New architecture" }));
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Integration Swarm{Enter}");

    const name = await screen.findByRole("textbox", { name: "Architecture name" });
    expect(name).toHaveValue("Integration Swarm");
    expect(await screen.findByText("Saved")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Agent$/ }));
    const toolbar = document.querySelector<HTMLElement>(".sa-toolbar")!;
    await waitFor(() => expect(within(toolbar).getByRole("button", { name: "Delete" })).toBeEnabled());

    await user.click(screen.getByRole("button", { name: "Library" }));
    const link = await screen.findByRole("link", { name: "Integration Swarm" });
    expect(link.closest("tr")).toHaveTextContent("1 component");

    // A fresh app instance reads the same browser storage (M7).
    unmount();
    act(() => window.history.replaceState(null, "", "#/"));
    render(<App />);
    expect(await screen.findByRole("link", { name: "Integration Swarm" })).toBeInTheDocument();
  });
});
