import { useSyncExternalStore } from "react";

interface Announcement {
  id: number;
  message: string;
}

let currentAnnouncement: Announcement = { id: 0, message: "" };
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Announcement {
  return currentAnnouncement;
}

export function announce(message: string): void {
  currentAnnouncement = { id: currentAnnouncement.id + 1, message };
  listeners.forEach((listener) => listener());
}

export function LiveRegion() {
  const announcement = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return (
    <div className="sa-live-region" role="status" aria-live="polite" aria-atomic="true">
      <span key={announcement.id}>{announcement.message}</span>
    </div>
  );
}
