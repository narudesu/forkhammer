import { createEffect, scopeBind, type Scope } from "effector";
import type { WorkerContext } from "src/worker/context/types";
import { reconcileRequested } from "src/worker/events/store-events";
import type { UltrafeedEvent } from "src/worker/feed/feed-events";
import { feedEventReceived } from "src/worker/jira-artifact/jira-artifact-events";
import { hydratableArtifactStore } from "src/worker/jira-artifact/jira-artifact-store";
import type { RealtimeEventBuffer } from "src/worker/realtime/event-buffer";

export interface SubscribedEventData {
  ctx: WorkerContext;
  buffer: RealtimeEventBuffer;
  scope: Scope;
}

export const effectSubscribed = createEffect(
  async ({ buffer, ctx, scope }: SubscribedEventData) => {
    const stores = [hydratableArtifactStore];

    ctx.log.debug(
      "inited stores =",
      stores.map((store) => store.getName()).join(", "),
    );

    const { earliestCursor } = await ctx.snapshots.hydrateStores(scope, stores);

    const persistSnapshots = async () => {
      for (const store of stores) {
        await ctx.snapshots.persistStore(scope, store);
      }
    };

    const processEvents = async (events: UltrafeedEvent[]) => {
      for (const event of events) {
        scopeBind(feedEventReceived, { scope })(event);
      }
    };

    const reconcileStores = async () => {
      scopeBind(reconcileRequested, { scope })({ ctx });
    };

    // load events since the oldest cursor
    const backfillEvents = await ctx.writer.read({ after: earliestCursor });
    ctx.log.debug(`backfilling ${backfillEvents.length} events`);

    // we drain buffer - as the events in the buffer will be provided by the backfill
    buffer.drain();

    await processEvents(backfillEvents);

    // now we drain buffer again to make sure all events that we have received meanwhile are also processed
    await processEvents(buffer.drain());

    // we persist snapshots
    await persistSnapshots();

    // we can run side-effects based on the updated state now
    ctx.log.debug("running reconciliation after init");
    await reconcileStores();

    let event: UltrafeedEvent | null = await buffer.next();
    while (event) {
      await processEvents([event]);
      await reconcileStores();
      await persistSnapshots();
      event = await buffer.next();
    }

    ctx.log.debug("no more events");
  },
);
