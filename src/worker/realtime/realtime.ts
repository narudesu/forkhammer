import { RealtimeEventBuffer } from "src/worker/realtime/event-buffer";
import { REALTIME_CHANNEL_NAME } from "../constants";
import type { ExecutionContext } from "../context";
import {
  processEvent,
  ProcessEventStores,
  reconcileStores,
} from "../event-processor";
import {
  hydrateStores,
  loadBackfillEvents,
  persistDueSnapshots,
} from "../state-manager";
import type { ProcessResult, RealtimeChannelLike } from "../types";

export interface RealtimeSubscriptionOptions {
  createStores: (ctx: ExecutionContext) => ProcessEventStores;
}

export async function runRealtimeSubscription(
  ctx: ExecutionContext,
  options: RealtimeSubscriptionOptions,
): Promise<ProcessResult> {
  return new Promise<ProcessResult>((resolve) => {
    let stopped = false;
    let processingStarted = false;

    const buffer = new RealtimeEventBuffer();
    const stores = options.createStores(ctx);
    const seenEventIds = new Set<string>();
    const cursor = {
      current: null as { created_at: string; id: string } | null,
    };

    const channel = ctx.supabase.client.channel(REALTIME_CHANNEL_NAME).on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: ctx.config.table,
      },
      (payload) => {
        const event = payload.new;
        ctx.log.debug("realtime insert received %s", event.id);
        buffer.push(event);
      },
    );

    const stop = async (
      activeChannel: RealtimeChannelLike,
      reason: string,
      unauthorized: boolean,
    ) => {
      if (stopped) {
        return;
      }

      stopped = true;
      buffer.close();
      ctx.log.debug("stopping realtime subscription: %s", reason);
      await activeChannel.unsubscribe();
      resolve({ unauthorized, processed: false });
    };

    const startProcessing = async () => {
      if (processingStarted) {
        return;
      }

      processingStarted = true;

      try {
        cursor.current = await hydrateStores(stores.workerStores);
        const snapshotEvents = await loadBackfillEvents(ctx, cursor.current);
        ctx.log.debug("loaded %d backfill events", snapshotEvents.length);

        if (stopped) {
          return;
        }

        for (const event of snapshotEvents) {
          if (stopped) {
            return;
          }

          await processEvent(ctx, event, stores, seenEventIds, cursor, {
            reconcile: false,
          });
          await persistDueSnapshots(stores.workerStores, cursor.current);
        }

        let bufferedEvents = buffer.drain();
        while (bufferedEvents.length > 0) {
          if (stopped) {
            return;
          }

          for (const event of bufferedEvents) {
            if (stopped) {
              return;
            }

            await processEvent(ctx, event, stores, seenEventIds, cursor, {
              reconcile: false,
            });
            await persistDueSnapshots(stores, cursor.current);
          }

          bufferedEvents = buffer.drain();
        }

        if (stopped) {
          return;
        }

        ctx.log.debug("projection caught up; reconciling stores");
        await reconcileStores(ctx, stores.workerStores);
        await persistDueSnapshots(stores.workerStores, cursor.current);

        while (!stopped) {
          const event = await buffer.next();
          if (!event) {
            break;
          }

          await processEvent(ctx, event, stores, seenEventIds, cursor, {
            reconcile: true,
          });
          await persistDueSnapshots(stores.workerStores, cursor.current);
        }
      } catch (error) {
        ctx.log.debug("realtime pipeline error %o", error);
        await stop(channel, "realtime pipeline failed", false);
      }
    };

    channel.subscribe((status: string) => {
      ctx.log.debug("realtime channel status %s", status);

      if (status === "SUBSCRIBED") {
        void startProcessing();
      }

      if (
        status === "TIMED_OUT" ||
        status === "CHANNEL_ERROR" ||
        status === "CLOSED"
      ) {
        void stop(channel, `realtime ${status.toLowerCase()}`, false);
      }
    });
  });
}
