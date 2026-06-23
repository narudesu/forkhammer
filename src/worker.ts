import { WorkerLoop } from "src/worker/worker-loop";
import { formatError } from "./error-format";
import { ensureWebRtcGlobals } from "./webrtc-compat";
import { loadWorkerConfig } from "./worker/config";
import { createExecutionContext } from "./worker/context";
import { createWorkerStores } from "src/worker/stores/registry";

export async function runWorker() {
  ensureWebRtcGlobals();

  const workerConfig = await loadWorkerConfig();
  const ctx = createExecutionContext(workerConfig);

  await WorkerLoop.run(ctx, {
    realtime: {
      // worker stores drive the application
      createStores: (ctx) => createWorkerStores(ctx),
    },
  });
}

if (import.meta.main) {
  runWorker().catch((error) => {
    console.error("worker fatal\n%s", formatError(error));
    process.exit(1);
  });
}
