import { afterEach, describe, expect, it, vi } from "vitest";
import {
  notifyArchitectureChanged,
  openArchitectureTabSync,
  subscribeArchitectureChanges,
} from "./tabSync";

type MessageListener = (event: MessageEvent) => void;

class MockBroadcastChannel {
  static channels: MockBroadcastChannel[] = [];
  readonly name: string;
  private readonly listeners = new Set<MessageListener>();
  closed = false;

  constructor(name: string) {
    this.name = name;
    MockBroadcastChannel.channels.push(this);
  }

  addEventListener(_type: string, listener: MessageListener): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: string, listener: MessageListener): void {
    this.listeners.delete(listener);
  }

  postMessage(data: unknown): void {
    for (const channel of MockBroadcastChannel.channels) {
      if (channel === this || channel.closed || channel.name !== this.name) continue;
      queueMicrotask(() => {
        for (const listener of channel.listeners) {
          listener({ data } as MessageEvent);
        }
      });
    }
  }

  close(): void {
    this.closed = true;
  }
}

afterEach(() => {
  MockBroadcastChannel.channels = [];
  vi.unstubAllGlobals();
});

describe("cross-tab notifications", () => {
  it("notifies both editors when the same architecture is open", async () => {
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    const first = vi.fn();
    const second = vi.fn();
    const firstController = openArchitectureTabSync("arch_shared", first);
    const secondController = openArchitectureTabSync("arch_shared", second);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    firstController.close();
    secondController.close();
  });

  it("notifies library subscribers when a repository write is broadcast", async () => {
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    const onChanged = vi.fn();
    const unsubscribe = subscribeArchitectureChanges(onChanged);
    notifyArchitectureChanged("arch_changed");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onChanged).toHaveBeenCalledWith("arch_changed");
    unsubscribe();
  });
});
