import { createEvent, fork, sample, scopeBind } from "effector";
import { onceEvent } from "src/effector/simple";
import type { WorkerContext } from "src/worker/context/types";
import {
  effectSubscribed,
  type SubscribedEventData,
} from "src/worker/realtime/effect-subscribe";
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
      scopeBind(subscribed, { scope })({ buffer, ctx, scope });
    },
  });

  // wait for unsubscribe, then return
  await onceEvent(unsubscribedChannel, { scope });
}

sample({
  clock: subscribed,
  target: effectSubscribed,
});
