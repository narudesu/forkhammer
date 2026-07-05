import { createEvent } from "effector";
import type { ReconcilableStore, WorkerStore } from "./stores/types";
import type { WorkerContext } from "src/worker/context/types";
import type { UltrafeedEvent } from "src/worker/feed/feed-events";

export const feedEventReceived = createEvent<UltrafeedEvent>();

export interface ProcessEventStores {
  workerStores: WorkerStore<any>[];
  extraReconcilables: ReconcilableStore[];
}

export async function processEvent(
  ctx: WorkerContext,
  event: UltrafeedEvent,
  stores: ProcessEventStores,
  seenEventIds: Set<string>,
  cursor: { current: { created_at: string; id: string } | null },
  options: { reconcile?: boolean } = {},
): Promise<void> {
  if (seenEventIds.has(event.id)) {
    ctx.log.debug(
      "skipping duplicate event %s (%s)",
      event.id,
      event.event_type,
    );
  }

  seenEventIds.add(event.id);
  ctx.log.debug("reducing event %s (%s)", event.id, event.event_type);

  // tell each classic store
  for (const store of stores.workerStores) {
    store.reduce(event, cursor.current);
  }

  // tell effector logic about the event
  feedEventReceived(event);

  cursor.current = { created_at: event.created_at, id: event.id };

  if (options.reconcile) {
    await reconcileStores(ctx, [
      ...stores.workerStores,
      ...stores.extraReconcilables,
    ]);
  }
}

export async function reconcileStores(
  ctx: WorkerContext,
  stores: Array<ReconcilableStore>,
) {
  await Promise.all(
    stores.map(async (store) => {
      try {
        await store.reconcile();
      } catch (error) {
        ctx.log.error(
          "reconcile failed for store %s: %s",
          store.name,
          error instanceof Error ? error.message : String(error),
        );
      }
    }),
  );
}
