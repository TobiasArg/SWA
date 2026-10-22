import { SCHEMA_VERSION, type Architecture, type ArchitectureFile } from "../domain/types";

/**
 * Shared helpers for the WS-E tests (app, library, toolbar). jsdom does not implement
 * `HTMLDialogElement.showModal`/`close`, so tests install a minimal version.
 */
export function installDialogPolyfill(): void {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { __saPolyfill?: boolean };
  if (proto.__saPolyfill || typeof proto.showModal === "function") return;
  proto.__saPolyfill = true;
  proto.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
    // Escape fires a cancelable `cancel` and closes the dialog unless it was prevented.
    if (!this.dataset.saEscape) {
      this.dataset.saEscape = "1";
      this.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || !this.hasAttribute("open")) return;
        event.preventDefault();
        if (this.dispatchEvent(new Event("cancel", { cancelable: true }))) this.close();
      });
    }
    // Browsers focus the first focusable element when a modal dialog opens.
    this.querySelector<HTMLElement>("input, select, textarea, button, a[href], [tabindex]:not([tabindex='-1'])")?.focus();
  };
  proto.show = proto.showModal;
  proto.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

export function makeArchitecture(overrides: Partial<Architecture> = {}): Architecture {
  return {
    id: "arch_test",
    name: "Lead Hunting Engine",
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
    components: [],
    relationships: [],
    groups: [],
    ...overrides,
  };
}

export function makeFile(overrides: Partial<Architecture> = {}): ArchitectureFile {
  return { schemaVersion: SCHEMA_VERSION, architecture: makeArchitecture(overrides) };
}

export function jsonFile(content: unknown, name = "architecture.json"): File {
  const text = typeof content === "string" ? content : JSON.stringify(content);
  return new File([text], name, { type: "application/json" });
}
