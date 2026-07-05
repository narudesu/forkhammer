import { createWorkerStores } from "src/worker/stores/registry";
import { runWorkerLoop } from "src/worker/worker-loop";
import { ensureWebRtcGlobals } from "./webrtc/webrtc-compat";
import { loadWorkerConfig } from "./worker/config";
import { createWorkerContext } from "./worker/context";

export async function runWorker() {
  ensureWebRtcGlobals();

  const workerConfig = await loadWorkerConfig();
  const ctx = createWorkerContext(workerConfig, {
    realtime: {
      // worker stores drive the application
      createStores: (ctx) => createWorkerStores(ctx),
    },
  });

  await runWorkerLoop(ctx);
}
