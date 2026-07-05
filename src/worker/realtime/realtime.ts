import { createEffect, createEvent, fork, sample, scopeBind } from "effector";
import { onceEvent } from "src/effector/simple";
import type { WorkerContext } from "src/worker/context/types";
import type { UltrafeedEvent } from "src/worker/feed/feed-events";
import { feedEventReceived } from "src/worker/jira-artifact/jira-artifact-events";
import { RealtimeEventBuffer } from "src/worker/realtime/event-buffer";
import { FeedChannel } from "src/worker/realtime/feed-channel";

const unsubscribedChannel = createEvent();
const subscribed = createEvent<SubscribedEventData>();

export async function runRealtimeSubscriptionRound(
  ctx: WorkerContext,
): Promise<void> {
  const buffer = new RealtimeEventBuffer();
  const scope = fork();

  const channel = await FeedChannel.initialize(ctx, {
    onEvent: (event) => {
      buffer.push(event);
    },
    onErrorStatus: () => {
      channel.stop();
    },
    onUnsubscribed: () => {
      buffer.close();
      scopeBind(unsubscribedChannel, { scope })();
    },
    onSubscribed: () => {
      scopeBind(subscribed, { scope })({ buffer, ctx });
    },
  });

  // wait for unsubscribe, then return
  await onceEvent(unsubscribedChannel, { scope });
}

interface SubscribedEventData {
  ctx: WorkerContext;
  buffer: RealtimeEventBuffer;
}

const effectSubscribed = createEffect(
  async ({ buffer, ctx }: SubscribedEventData) => {
    // desired behavior:
    // 1. hydrate stores from disk
    // 2. we load backfill events - based on the resolved combined cursor
    // 3. we process every backfill event with reconcile: false
    // 4. we persist snapshots
    // 5. we load buffered events
    // 6. we process every buferred event one after another with reconcile: false
    // 7. we persist snapshots
    // 8. we reconcile stores
    // 9. we persist snapshots
    // 10. while not stopped, we get next event from the buffer, process it and reconcile

    const readResult = await ctx.writer.read({
      since: new Date(0).toISOString(),
    });
    for (const event of readResult) {
      // handle each event received
      feedEventReceived(event);
    }
    console.log("waiting for event");
    let event: UltrafeedEvent | null = await buffer.next();
    while (event) {
      console.log("event", event);
      console.log("waiting for event");
      event = await buffer.next();
    }
  },
);

sample({
  clock: subscribed,
  target: effectSubscribed,
});
