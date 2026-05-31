import type { ExecutionContext } from "./context";
import type { FeedEvent, ProcessResult } from "./types";
import type { WorkerStore } from "./stores/types";

export async function processEvent(
  ctx: ExecutionContext,
  event: FeedEvent,
  stores: Array<WorkerStore<any>>,
  seenEventIds: Set<string>,
  cursor: { current: { created_at: string; id: string } | null },
  options: { reconcile?: boolean } = {},
): Promise<ProcessResult> {
  if (seenEventIds.has(event.id)) {
    ctx.log.debug(
      "skipping duplicate event %s (%s)",
      event.id,
      event.event_type,
    );
    return { unauthorized: false, processed: false };
  }

  seenEventIds.add(event.id);
  ctx.log.debug("reducing event %s (%s)", event.id, event.event_type);

  for (const store of stores) {
    store.reduce(event, cursor.current);
  }

  cursor.current = { created_at: event.created_at, id: event.id };

  if (options.reconcile) {
    await reconcileStores(ctx, stores);
  }

  return { unauthorized: false, processed: true };
}

export async function reconcileStores(
  ctx: ExecutionContext,
  stores: Array<WorkerStore<any>>,
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
