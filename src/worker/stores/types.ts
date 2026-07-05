import type { UltrafeedEvent } from "src/worker/feed/feed-events";

export type EventCursor = {
  created_at: string;
  id: string;
};

export function isAfterCurrentCursor(
  cursor: EventCursor | null,
  event: UltrafeedEvent,
) {
  if (!cursor) {
    return true;
  }

  if (event.created_at !== cursor.created_at) {
    return event.created_at > cursor.created_at;
  }

  return event.id > cursor.id;
}

export function getEarliestCursor(cursors: (EventCursor | null)[]) {
  let earliest: EventCursor | null = null;

  for (const cursor of cursors) {
    if (!cursor) {
      continue;
    }

    if (
      !earliest ||
      cursor.created_at < earliest.created_at ||
      (cursor.created_at === earliest.created_at && cursor.id < earliest.id)
    ) {
      earliest = cursor;
    }
  }

  return earliest;
}

export type StoreSnapshot<TState = unknown> = {
  version: 1;
  reducedEventsSinceSnapshot: number;
  state: TState;
};

export type StoreSnapshotBundle = {
  version: 1;
  cursor: EventCursor | null;
  stores: Record<string, StoreSnapshot>;
};

export interface ReconcilableStore {
  name: string;
  reconcile: () => Promise<boolean>;
}

export type WorkerStore<TState = unknown> = {
  name: string;
  reduce: (event: UltrafeedEvent, cursor: EventCursor | null) => boolean;
  reconcile: () => Promise<boolean>;
  hydrate: (snapshot: StoreSnapshot<TState> | null) => void;
  snapshot: () => StoreSnapshot<TState>;
  needsSnapshot: () => boolean;
  markSnapshotPersisted: () => void;
};
