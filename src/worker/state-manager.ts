import type { ExecutionContext } from "./context";
import {
  compareEventCursor,
  getMinimumCursor,
  isAfterCursor,
  readStoreSnapshot,
  writeStoreSnapshot,
} from "./persistence";
import type { FeedEvent } from "./types";
import type { WorkerStore } from "./stores/types";

export async function hydrateStores(stores: Array<WorkerStore<any>>) {
  for (const store of stores) {
    const snapshot = await readStoreSnapshot(store.name);
    store.hydrate(snapshot);
  }
}

export function getReplayCursor(stores: Array<WorkerStore<any>>) {
  return getMinimumCursor(stores.map((store) => store.getCursor()));
}

export async function loadBackfillEvents(
  ctx: ExecutionContext,
  cursor: ReturnType<typeof getReplayCursor>,
) {
  let query = ctx.supabase.client.from(ctx.config.table).select("*");

  if (cursor) {
    query = query.gte("created_at", cursor.created_at);
  }

  const { data, error } = await query.order("created_at", { ascending: true });

  if (error) {
    throw new Error(`snapshot-load-failed:${error.message}`);
  }

  return (data ?? [])
    .filter((event) => isAfterCursor(event, cursor))
    .sort((left, right) => compareEventCursor(left, right));
}

export async function persistDueSnapshots(stores: Array<WorkerStore<any>>) {
  for (const store of stores) {
    if (!store.needsSnapshot()) {
      continue;
    }

    await writeStoreSnapshot(store.name, store.snapshot());
    store.markSnapshotPersisted();
  }
}
