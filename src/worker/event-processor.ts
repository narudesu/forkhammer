import type { ExecutionContext } from "./context";
import type { FeedEvent, ProcessResult } from "./types";
import type { WorkerStore } from "./stores/types";

export async function processEvent(
  ctx: ExecutionContext,
  event: FeedEvent,
  stores: Array<WorkerStore<any>>,
  seenEventIds: Set<string>,
  options: { reconcile?: boolean } = {},
): Promise<ProcessResult> {
  if (seenEventIds.has(event.id)) {
    ctx.log.debug(
      "skipping duplicate event %s (%s)",
      event.id,
      event.event_type,
    );
    return { unauthorized: false };
  }

  seenEventIds.add(event.id);
  ctx.log.debug("reducing event %s (%s)", event.id, event.event_type);

  for (const store of stores) {
    store.reduce(event);
  }

  if (options.reconcile) {
    await reconcileStores(stores);
  }

  return { unauthorized: false };
}

export async function reconcileStores(stores: Array<WorkerStore<any>>) {
  await Promise.all(stores.map((store) => store.reconcile()));
}
