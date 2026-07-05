import type { WorkerContext } from "src/worker/context/types";
import type { UltrafeedEvent } from "src/worker/feed/feed-events";

export abstract class FeedChannel {
  abstract stop(): Promise<void>;

  static initialize = initializeFeedChannel;
}

type ErrorStatus = "TIMED_OUT" | "CHANNEL_ERROR" | "CLOSED";

interface FeedChannelOptions {
  onEvent: (event: UltrafeedEvent) => void;
  onSubscribed: () => void;
  onErrorStatus: (status: ErrorStatus) => void;
  onUnsubscribed: () => void;
}

interface FeedChannelState {
  hasHandledStop: boolean;
}

async function initializeFeedChannel(
  ctx: WorkerContext,
  opts: FeedChannelOptions,
): Promise<FeedChannel> {
  const state: FeedChannelState = {
    hasHandledStop: false,
  };
  const channel = ctx.supabase.channel("app:supabase-worker").on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: ctx.workerConfig.supabase.table,
    },
    (payload) => {
      const event = payload.new as UltrafeedEvent;

      ctx.log.debug("realtime insert received %s", event.id);

      opts.onEvent(event);
    },
  );

  channel.subscribe((status) => {
    ctx.log.debug("realtime channel status %s", status);

    if (status === "SUBSCRIBED") {
      opts.onSubscribed();
    }

    if (
      status === "TIMED_OUT" ||
      status === "CHANNEL_ERROR" ||
      status === "CLOSED"
    ) {
      opts.onErrorStatus(status);
    }
  });

  return {
    async stop() {
      if (state.hasHandledStop) {
        // idempotent
        return;
      }
      state.hasHandledStop = true;

      ctx.log.debug("unsubscribing from realtime");
      await channel.unsubscribe();
      opts.onUnsubscribed();
    },
  };
}
