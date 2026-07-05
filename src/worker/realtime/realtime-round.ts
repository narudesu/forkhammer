import { createEvent, fork, scopeBind } from "effector";
import { onceEvent } from "src/effector/simple";
import type { WorkerContext } from "src/worker/context/types";
import { effectSubscribed } from "src/worker/realtime/effect-subscribed";
import { RealtimeEventBuffer } from "src/worker/realtime/event-buffer";
import { FeedChannel } from "src/worker/realtime/feed-channel";

const unsubscribedChannel = createEvent();

export async function runRealtimeSubscriptionRound(
  ctx: WorkerContext,
): Promise<void> {
  const buffer = new RealtimeEventBuffer();
  const scope = fork();
  const subscribedScope = fork();

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
      console.log("on subscribed");
      // we run subscribed in separate scope to avoid blocking allSettled
      scopeBind(effectSubscribed, { scope: subscribedScope })({
        buffer,
        ctx,
        scope,
      }).catch((err) => {
        console.error(err);
      });
    },
  });

  // wait for unsubscribe, then return
  await onceEvent(unsubscribedChannel, { scope });
}
