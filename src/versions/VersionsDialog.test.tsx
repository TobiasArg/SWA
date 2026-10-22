import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { installDialogPolyfill, makeArchitecture } from "../app/testUtils";
import { createComponent } from "../domain/factories";
import { toArchitectureFile } from "../domain/serialize";
import type { Architecture } from "../domain/types";
import {
  diagramKey,
  fingerprintDiagramKey,
  type SnapshotCaptureResult,
  type SnapshotClass,
  type SnapshotListItem,
  type SnapshotTrigger,
} from "../persistence/snapshots";
import {
  formatCounts,
  formatVersionDate,
  RESTORE_FLUSH_FAILED,
  RESTORE_RECOVERY_FAILED,
  VersionsDialog,
  type VersionsDialogProps,
} from "./VersionsDialog";

beforeAll(installDialogPolyfill);

const NOW = new Date(2026, 9, 22, 15, 0);
const now = () => NOW;
const noEstimate = async () => undefined;

const current = makeArchitecture({
  components: [createComponent("agent", { position: { x: 0, y: 0 }, existingNames: [] })],
});
const currentFingerprint = fingerprintDiagramKey(diagramKey(toArchitectureFile(current)));

const CLASS: Record<SnapshotTrigger, SnapshotClass> = {
  open: "auto",
  interval: "auto",
  leave: "auto",
  manual: "manual",
  "pre-restore": "recovery",
};

function okItem(id: string, createdAt: Date, trigger: SnapshotTrigger, fingerprint = "0123456789abcdef"): SnapshotListItem {
  return {
    id,
    architectureId: current.id,
    status: "ok",
    createdAt: createdAt.toISOString(),
    trigger,
    snapshotClass: CLASS[trigger],
    fingerprint,
    counts: { components: 12, relationships: 9, groups: 2 },
  };
}

const todayItem = okItem("snap_today", new Date(2026, 9, 22, 14, 5), "manual", currentFingerprint);
const yesterdayItem = okItem("snap_yesterday", new Date(2026, 9, 21, 9, 12), "interval");
const olderItem = okItem("snap_older", new Date(2026, 9, 10, 8, 30), "pre-restore");
const damagedItem: SnapshotListItem = {
  id: "snap_damaged",
  architectureId: current.id,
  status: "damaged",
  createdAt: new Date(2026, 9, 9, 8, 0).toISOString(),
  message: "This version is damaged and can't be restored.",
};

function renderDialog(props: Partial<VersionsDialogProps> & { items?: SnapshotListItem[]; architecture?: Architecture } = {}) {
  const { items = [todayItem, yesterdayItem, olderItem, damagedItem], ...rest } = props;
  const list = vi.fn(async () => items);
  const onSaveNow = vi.fn(async (): Promise<SnapshotCaptureResult> => ({ status: "created", id: "snap_new" }));
  const onRestore = vi.fn(async () => undefined);
  const onClose = vi.fn();
  const view = render(
    <VersionsDialog
      open
      architecture={current}
      snapshots={{ list }}
      onSaveNow={onSaveNow}
      onRestore={onRestore}
      onClose={onClose}
      estimateStorage={noEstimate}
      now={now}
      {...rest}
    />,
  );
  return { ...view, list, onSaveNow, onRestore, onClose };
}

function timeLabel(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
}

describe("VersionsDialog", () => {
  it("renders nothing while closed", () => {
    renderDialog({ open: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("lists versions newest first with date, kind, counts and the Current badge", async () => {
    const { list } = renderDialog();
    const dialog = screen.getByRole("dialog", { name: "Versions of 'Lead Hunting Engine'" });
    expect(within(dialog).getByText("Loading versions…")).toHaveAttribute("role", "status");

    const ordered = await within(dialog).findByRole("list", { name: "Versions, newest first" });
    expect(ordered.tagName).toBe("OL");
    expect(list).toHaveBeenCalledWith("arch_test");
    const rows = within(ordered).getAllByRole("listitem") as [HTMLElement, HTMLElement, HTMLElement, HTMLElement];
    expect(rows).toHaveLength(4);

    const todayTime = timeLabel(new Date(2026, 9, 22, 14, 5));
    expect(within(rows[0]).getByText(`Today ${todayTime}`).tagName).toBe("TIME");
    expect(within(rows[0]).getByText(`Today ${todayTime}`)).toHaveAttribute("dateTime", todayItem.createdAt);
    expect(within(rows[0]).getByText("Saved")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Current")).toBeInTheDocument();
    expect(within(rows[0]).getByText("12 components · 9 relationships · 2 groups")).toBeInTheDocument();

    expect(within(rows[1]).getByText(`Yesterday ${timeLabel(new Date(2026, 9, 21, 9, 12))}`)).toBeInTheDocument();
    expect(within(rows[1]).getByText("Automatic")).toBeInTheDocument();
    expect(within(rows[1]).queryByText("Current")).not.toBeInTheDocument();
    expect(within(rows[2]).getByText("Before restore")).toBeInTheDocument();

    expect(screen.getByText(/Versions are stored only in this browser\./)).toHaveTextContent(
      "Versions are stored only in this browser. Up to 30 automatic, 20 saved and 10 before-restore versions are kept. Versions are not included in JSON export.",
    );
  });

  it("disables Restore on the Current row and names each Restore button by its date", async () => {
    renderDialog();
    await screen.findByRole("list");
    const todayTime = timeLabel(new Date(2026, 9, 22, 14, 5));
    expect(screen.getByRole("button", { name: `Restore the version from today at ${todayTime}` })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: `Restore the version from yesterday at ${timeLabel(new Date(2026, 9, 21, 9, 12))}` }),
    ).toBeEnabled();
  });

  it("shows a damaged row's message instead of a Restore button", async () => {
    renderDialog();
    const rows = within(await screen.findByRole("list")).getAllByRole("listitem") as HTMLElement[];
    const damagedRow = rows[3] as HTMLElement;
    expect(within(damagedRow).getByText("This version is damaged and can't be restored.")).toBeInTheDocument();
    expect(within(damagedRow).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Restore the version from/ })).toHaveLength(3);
  });

  it("shows the empty state", async () => {
    renderDialog({ items: [] });
    expect(
      await screen.findByText(
        "No versions yet. A version is saved when you open an architecture that changed, every 10 minutes while you edit, and when you leave the editor.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("shows an error with Retry that reloads the list", async () => {
    const user = userEvent.setup();
    const list = vi
      .fn<(id: string) => Promise<SnapshotListItem[]>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce([yesterdayItem]);
    renderDialog({ snapshots: { list } });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Versions could not be loaded.");
    await user.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("list")).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Versions could not be loaded.")).not.toBeInTheDocument();
  });

  it("saves a version now and reports each result", async () => {
    const user = userEvent.setup();
    const { onSaveNow, list } = renderDialog();
    await screen.findByRole("list");
    const saveButton = screen.getByRole("button", { name: "Save version now" });

    await user.click(saveButton);
    expect(await screen.findByText("Version saved.")).toHaveAttribute("role", "status");
    expect(onSaveNow).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));

    onSaveNow.mockResolvedValueOnce({ status: "unchanged", id: "snap_today" });
    await user.click(saveButton);
    expect(await screen.findByText("No changes since the last version.")).toBeInTheDocument();

    onSaveNow.mockRejectedValueOnce(new Error("Your latest changes could not be saved."));
    await user.click(saveButton);
    expect(await screen.findByRole("alert")).toHaveTextContent("Your latest changes could not be saved.");
  });

  it("warns before the 21st saved version replaces the oldest", async () => {
    const manual = Array.from({ length: 20 }, (_, index) =>
      okItem(`snap_m${index}`, new Date(2026, 8, 1 + index, 10, 0), "manual"),
    );
    renderDialog({ items: manual });
    await screen.findByRole("list");
    expect(screen.getByRole("button", { name: "Save version now" })).toHaveAccessibleDescription(
      "Saving removes the oldest saved version.",
    );
  });

  it("shows a low-storage notice from the storage estimate", async () => {
    renderDialog({ estimateStorage: async () => ({ usage: 90, quota: 100 }) });
    expect(await screen.findByText(/storage is almost full, so automatic versions are paused/)).toBeInTheDocument();
  });

  it("confirms a restore with the designed copy and Cancel focused, then returns focus", async () => {
    const user = userEvent.setup();
    const { onRestore } = renderDialog();
    await screen.findByRole("list");
    const time = timeLabel(new Date(2026, 9, 21, 9, 12));
    const restore = screen.getByRole("button", { name: `Restore the version from yesterday at ${time}` });

    await user.click(restore);
    const confirm = screen.getByRole("dialog", { name: `Restore the version from yesterday at ${time}?` });
    expect(confirm).toHaveAccessibleDescription(
      "The diagram is replaced with this version (12 components · 9 relationships · 2 groups). Your current diagram is saved as a version first, so you can switch back. The name and description stay as they are.",
    );
    expect(within(confirm).getByRole("button", { name: "Cancel" })).toHaveFocus();
    expect(within(confirm).getByRole("button", { name: "Restore" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: /\?$/ })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Versions of 'Lead Hunting Engine'" })).toBeInTheDocument();
    expect(restore).toHaveFocus();
    expect(onRestore).not.toHaveBeenCalled();
  });

  it("restores through onRestore and closes the confirmation on success", async () => {
    const user = userEvent.setup();
    let resolve!: () => void;
    const onRestore = vi.fn(() => new Promise<void>((done) => (resolve = done)));
    renderDialog({ onRestore });
    await screen.findByRole("list");

    await user.click(screen.getByRole("button", { name: /^Restore the version from yesterday/ }));
    const confirm = screen.getByRole("dialog", { name: /^Restore the version from yesterday/ });
    await user.click(within(confirm).getByRole("button", { name: "Restore" }));
    expect(onRestore).toHaveBeenCalledWith("snap_yesterday");
    expect(confirm).toHaveAttribute("aria-busy", "true");
    expect(within(confirm).getByRole("button", { name: "Restoring…" })).toBeDisabled();
    expect(within(confirm).getByRole("button", { name: "Cancel" })).toBeDisabled();

    resolve();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /^Restore the version/ })).not.toBeInTheDocument());
  });

  it.each([RESTORE_FLUSH_FAILED, RESTORE_RECOVERY_FAILED, "The version could not be applied."])(
    "keeps the confirmation open with an inline error when restore fails: %s",
    async (message) => {
      const user = userEvent.setup();
      const onRestore = vi.fn(async () => {
        throw new Error(message);
      });
      renderDialog({ onRestore });
      await screen.findByRole("list");

      await user.click(screen.getByRole("button", { name: /^Restore the version from yesterday/ }));
      const confirm = screen.getByRole("dialog", { name: /^Restore the version from yesterday/ });
      await user.click(within(confirm).getByRole("button", { name: "Restore" }));

      expect(await within(confirm).findByRole("alert")).toHaveTextContent(message);
      expect(within(confirm).getByRole("button", { name: "Restore" })).toBeEnabled();
      expect(screen.getByRole("dialog", { name: /^Restore the version from yesterday/ })).toBeInTheDocument();
    },
  );

  it("closes through the Close button", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await screen.findByRole("list");
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("version formatting", () => {
  it("uses Today, Yesterday and a full date", () => {
    const at = (day: number) => new Date(2026, 9, day, 14, 5).toISOString();
    expect(formatVersionDate(at(22), NOW, "en-GB")).toEqual({ short: "Today 14:05", sentence: "today at 14:05" });
    expect(formatVersionDate(at(21), NOW, "en-GB")).toEqual({ short: "Yesterday 14:05", sentence: "yesterday at 14:05" });
    expect(formatVersionDate(at(1), NOW, "en-GB").short).toBe("1 Oct 2026, 14:05");
  });

  it("pluralizes counts", () => {
    expect(formatCounts({ components: 1, relationships: 0, groups: 1 })).toBe("1 component · 0 relationships · 1 group");
  });
});
