import type { FeedEvent } from "../types";

export type EventCursor = {
  created_at: string;
  id: string;
};

export type StoreSnapshot<TState = unknown> = {
  version: 1;
  cursor: EventCursor | null;
  reducedEventsSinceSnapshot: number;
  state: TState;
};

export type WorkerStore<TState = unknown> = {
  name: string;
  reduce: (event: FeedEvent) => boolean;
  reconcile: () => Promise<boolean>;
  hydrate: (snapshot: StoreSnapshot<TState> | null) => void;
  snapshot: () => StoreSnapshot<TState>;
  needsSnapshot: () => boolean;
  markSnapshotPersisted: () => void;
  getCursor: () => EventCursor | null;
};
