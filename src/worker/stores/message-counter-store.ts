import chalk from "chalk";
import type { WorkerContext } from "src/worker/context/types";
import type { UltrafeedEvent } from "src/worker/feed/feed-events";
import type { EventCursor, StoreSnapshot, WorkerStore } from "./types";

type MessageCounterState = {
  totalReceived: number;
  lastEventId: string | null;
  lastEventType: string | null;
};

const MESSAGE_COUNTER_DEBOUNCE_MS = 5000;
const storeLabel = chalk.cyan.bold("[message-counter]");

export function createMessageCounterStore(
  _ctx: WorkerContext,
): WorkerStore<MessageCounterState> {
  const state: MessageCounterState = {
    totalReceived: 0,
    lastEventId: null,
    lastEventType: null,
  };

  let reducedEventsSinceSnapshot = 0;
  let forceSnapshot = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  return {
    name: "message-counter",
    reduce(event: UltrafeedEvent, cursor: EventCursor | null) {
      if (!isAfterCurrentCursor(cursor, event)) {
        return false;
      }

      state.totalReceived += 1;
      state.lastEventId = event.id;
      state.lastEventType = event.event_type;
      cursor = { created_at: event.created_at, id: event.id };
      reducedEventsSinceSnapshot += 1;
      return true;
    },
    async reconcile() {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        console.log(
          `${storeLabel} ${chalk.green.bold("summary")} received ${chalk.green(String(state.totalReceived))} events; last=${chalk.white(state.lastEventId ?? "n/a")} (${chalk.white(state.lastEventType ?? "n/a")})`,
        );
      }, MESSAGE_COUNTER_DEBOUNCE_MS);

      return false;
    },
    hydrate(snapshot: StoreSnapshot<MessageCounterState> | null) {
      state.totalReceived = snapshot?.state.totalReceived ?? 0;
      state.lastEventId = snapshot?.state.lastEventId ?? null;
      state.lastEventType = snapshot?.state.lastEventType ?? null;
      reducedEventsSinceSnapshot = snapshot?.reducedEventsSinceSnapshot ?? 0;
      forceSnapshot = false;
    },
    snapshot() {
      return {
        version: 1 as const,
        reducedEventsSinceSnapshot,
        state,
      };
    },
    needsSnapshot() {
      return forceSnapshot || reducedEventsSinceSnapshot >= 10;
    },
    markSnapshotPersisted() {
      reducedEventsSinceSnapshot = 0;
      forceSnapshot = false;
    },
  };
}

function isAfterCurrentCursor(
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
