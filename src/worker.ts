import { createExecutionContext } from "./worker/context";
import { RETRY_DELAY_MS } from "./worker/constants";
import { formatError } from "./error-format";
import { loadWorkerConfig } from "./worker/config";
import { runRealtimeSubscription } from "./worker/realtime";
import type { ExecutionContext } from "./worker/context";

export async function runWorker() {
  const workerConfig = await loadWorkerConfig();
  const ctx = createExecutionContext(workerConfig);

  await runWorkerLoop(ctx);
}

async function runWorkerLoop(ctx: ExecutionContext) {
  ctx.log.debug("started worker loop");
  while (true) {
    try {
      const token = await ctx.auth.login();
      ctx.supabase.setAccessToken(token);
      ctx.log.debug("got access token");
      ctx.log.debug("starting realtime subscription");

      const realtimeResult = await runRealtimeSubscription(ctx);
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

if (import.meta.main) {
  runWorker().catch((error) => {
    console.error("worker fatal\n%s", formatError(error));
    process.exit(1);
  });
}
