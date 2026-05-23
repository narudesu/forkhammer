import { REALTIME_CHANNEL_NAME } from "./constants";
import type { ExecutionContext } from "./context";
import { processEvent, reconcileStores } from "./event-processor";
import type { FeedEvent, ProcessResult, RealtimeChannelLike } from "./types";
import { createWorkerStores } from "./stores/registry";
import type { WorkerStore } from "./stores/types";
import {
  hydrateStores,
  loadBackfillEvents,
  persistDueSnapshots,
  getReplayCursor,
} from "./state-manager";

type PendingResolver = (event: FeedEvent | null) => void;

class EventBuffer {
  private readonly events: Array<FeedEvent> = [];

  private readonly waiters: Array<PendingResolver> = [];

  private closed = false;

  push(event: FeedEvent) {
    if (this.closed) {
      return;
    }

    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(event);
      return;
    }

    this.events.push(event);
  }

  drain() {
    const drained = [...this.events];
    this.events.length = 0;
    return drained;
  }

  next() {
    const queued = this.events.shift();
    if (queued) {
      return Promise.resolve(queued);
    }

    if (this.closed) {
      return Promise.resolve(null);
    }

    return new Promise<FeedEvent | null>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  close() {
    this.closed = true;

    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      waiter?.(null);
    }
  }
}

export async function runRealtimeSubscription(
  ctx: ExecutionContext,
  options: {
    createStores?: (ctx: ExecutionContext) => Array<WorkerStore<any>>;
  } = {},
): Promise<ProcessResult> {
  return new Promise<ProcessResult>((resolve) => {
    let stopped = false;
    let processingStarted = false;
    const buffer = new EventBuffer();
    const stores = options.createStores?.(ctx) ?? createWorkerStores(ctx);
    const seenEventIds = new Set<string>();

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
      resolve({ unauthorized });
    };

    const startProcessing = async () => {
      if (processingStarted) {
        return;
      }

      processingStarted = true;

      try {
        await hydrateStores(stores);
        const replayCursor = getReplayCursor(stores);
        const snapshotEvents = await loadBackfillEvents(ctx, replayCursor);
        ctx.log.debug("loaded %d backfill events", snapshotEvents.length);

        if (stopped) {
          return;
        }

        for (const event of snapshotEvents) {
          if (stopped) {
            return;
          }

          await processEvent(ctx, event, stores, seenEventIds, {
            reconcile: false,
          });
          await persistDueSnapshots(stores);
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

            await processEvent(ctx, event, stores, seenEventIds, {
              reconcile: false,
            });
            await persistDueSnapshots(stores);
          }

          bufferedEvents = buffer.drain();
        }

        if (stopped) {
          return;
        }

        ctx.log.debug("projection caught up; reconciling stores");
        await reconcileStores(stores);
        await persistDueSnapshots(stores);

        while (!stopped) {
          const event = await buffer.next();
          if (!event) {
            break;
          }

          await processEvent(ctx, event, stores, seenEventIds, {
            reconcile: true,
          });
          await persistDueSnapshots(stores);
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
