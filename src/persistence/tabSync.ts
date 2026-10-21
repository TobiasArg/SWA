export const TAB_SYNC_CHANNEL = "swarm-architecturer";

export type TabSyncMessage =
  | { type: "opened"; id: string; tabId: string }
  | { type: "also-open"; id: string }
  | { type: "changed"; id: string };

export interface TabSyncController {
  close(): void;
}

function createChannel(): BroadcastChannel | undefined {
  if (typeof BroadcastChannel === "undefined") return undefined;
  try {
    return new BroadcastChannel(TAB_SYNC_CHANNEL);
  } catch {
    return undefined;
  }
}

let changeNotificationChannel: BroadcastChannel | undefined;
const architectureChangeListeners = new Set<(id: string) => void>();

function getChangeNotificationChannel(): BroadcastChannel | undefined {
  if (changeNotificationChannel) return changeNotificationChannel;
  changeNotificationChannel = createChannel();
  return changeNotificationChannel;
}

function createTabId(): string {
  return globalThis.crypto.randomUUID();
}

/** Announces that this tab has opened an architecture and reports peers. */
export function openArchitectureTabSync(id: string, onAlsoOpen: () => void): TabSyncController {
  const channel = createChannel();
  if (!channel) return { close() {} };

  const tabId = createTabId();
  const onMessage = (event: MessageEvent<TabSyncMessage>): void => {
    const message = event.data;
    if (!message || message.id !== id) return;
    if (message.type === "opened" && message.tabId !== tabId) {
      onAlsoOpen();
      channel.postMessage({ type: "also-open", id } satisfies TabSyncMessage);
    } else if (message.type === "also-open") {
      onAlsoOpen();
    }
  };

  channel.addEventListener("message", onMessage);
  channel.postMessage({ type: "opened", id, tabId } satisfies TabSyncMessage);
  return {
    close() {
      channel.removeEventListener("message", onMessage);
      channel.close();
    },
  };
}

/** Posts a repository write so open library screens can refresh their list. */
export function notifyArchitectureChanged(id: string): void {
  const channel = getChangeNotificationChannel();
  if (!channel) return;
  channel.postMessage({ type: "changed", id } satisfies TabSyncMessage);
  architectureChangeListeners.forEach((listener) => listener(id));
}

export function subscribeArchitectureChanges(onChanged: (id: string) => void): () => void {
  const channel = getChangeNotificationChannel();
  if (!channel) return () => {};
  const onMessage = (event: MessageEvent<TabSyncMessage>): void => {
    if (event.data?.type === "changed") onChanged(event.data.id);
  };
  architectureChangeListeners.add(onChanged);
  channel.addEventListener("message", onMessage);
  return () => {
    architectureChangeListeners.delete(onChanged);
    channel.removeEventListener("message", onMessage);
  };
}
