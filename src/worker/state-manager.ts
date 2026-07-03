import type { ExecutionContext } from "./context";
import {
  compareEventCursor,
  isAfterCursor,
  readStateSnapshotBundle,
  readStoreSnapshot,
  writeStateSnapshotBundle,
} from "./persistence";
import type { EventCursor, WorkerStore } from "./stores/types";

export async function hydrateStores(stores: Array<WorkerStore<any>>) {
  const bundle = await readStateSnapshotBundle();

  if (bundle) {
    for (const store of stores) {
      store.hydrate(bundle.stores[store.name] ?? null);
    }

    return bundle.cursor;
  }

  const snapshots = await Promise.all(
    stores.map(async (store) => {
      const snapshot = (await readStoreSnapshot(store.name)) as
        | (StoreSnapshotWithCursor | null)
        | null;
      return [store.name, snapshot] as const;
    }),
  );

  for (const [storeName, snapshot] of snapshots) {
    const store = stores.find((candidate) => candidate.name === storeName);
    store?.hydrate(snapshot);
  }

  return getMaximumCursor(
    snapshots.map(([, snapshot]) => snapshot?.cursor ?? null),
  );
}

export async function loadBackfillEvents(
  ctx: ExecutionContext,
  cursor: EventCursor | null,
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

export async function persistDueSnapshots(
  stores: Array<WorkerStore<any>>,
  cursor: EventCursor | null,
) {
  if (!stores.some((store) => store.needsSnapshot())) {
    return;
  }

  await writeStateSnapshotBundle({
    version: 1,
    cursor,
    stores: Object.fromEntries(
      stores.map((store) => [store.name, store.snapshot()]),
    ),
  });

  for (const store of stores) {
    store.markSnapshotPersisted();
  }
}

function getMaximumCursor(cursors: Array<EventCursor | null>) {
  const filtered = cursors.filter((cursor): cursor is EventCursor =>
    Boolean(cursor),
  );

  if (filtered.length === 0) {
    return null;
  }

  return filtered.reduce((maximum, cursor) =>
    compareEventCursor(cursor, maximum) > 0 ? cursor : maximum,
  );
}

type StoreSnapshotWithCursor = {
  cursor: EventCursor | null;
};
