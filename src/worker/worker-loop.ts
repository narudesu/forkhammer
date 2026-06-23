import { formatError } from "src/error-format";
import { RETRY_DELAY_MS } from "src/worker/constants";
import type { ExecutionContext } from "src/worker/context";
import {
  type RealtimeSubscriptionOptions,
  runRealtimeSubscription,
} from "src/worker/realtime/realtime";

async function runWorkerLoop(
  ctx: ExecutionContext,
  options: { realtime: RealtimeSubscriptionOptions },
) {
  ctx.log.debug("started worker loop");
  while (true) {
    try {
      const token = await ctx.auth.login();
      ctx.supabase.setAccessToken(token);
      ctx.log.debug("got access token");
      ctx.log.debug("starting realtime subscription");

      const realtimeResult = await runRealtimeSubscription(
        ctx,
        options.realtime,
      );
      if (realtimeResult.unauthorized) {
        ctx.log.debug("reauthorizing worker");
        continue;
      }

      ctx.log.debug(
        "realtime subscription ended, retrying in %dms",
        RETRY_DELAY_MS,
      );
      await ctx.runtime.sleep(RETRY_DELAY_MS);
    } catch (error) {
      ctx.log.error("worker loop error\n%s", formatError(error));
      ctx.log.debug("retrying realtime subscription in %dms", RETRY_DELAY_MS);
      await ctx.runtime.sleep(RETRY_DELAY_MS);
    }
  }
}

export const WorkerLoop = {
  run: runWorkerLoop,
};
