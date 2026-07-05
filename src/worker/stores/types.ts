import type { UltrafeedEvent } from "src/worker/feed/feed-events";

export type EventCursor = {
  created_at: string;
  id: string;
};

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
