import { formatError } from "src/error-handling/error-format";
import { RETRY_DELAY_MS } from "src/worker/constants";
import type { WorkerContext } from "src/worker/context/types";
import { runRealtimeSubscriptionRound } from "src/worker/realtime/realtime-round";
import { sleepMs } from "src/worker/sleep";

export async function runWorkerLoop(ctx: WorkerContext) {
  ctx.log.debug("started worker loop");
  while (true) {
    try {
      await ctx.auth.login();
      ctx.log.debug("logged in");

      await runRealtimeSubscriptionRound(ctx);

      ctx.log.debug(
        "realtime subscription ended, retrying in %dms",
        RETRY_DELAY_MS,
      );
      await sleepMs(RETRY_DELAY_MS);
    } catch (error) {
      ctx.log.error("worker loop error\n%s", formatError(error));
      ctx.log.debug("retrying realtime subscription in %dms", RETRY_DELAY_MS);
      await sleepMs(RETRY_DELAY_MS);
    }
  }
}
