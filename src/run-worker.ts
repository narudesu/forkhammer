import { hydratableOperationsArtifactStore } from "src/worker/operations-artifact/operations-artifact-store";
import { hydratablePeerStore } from "src/worker/peer/peer-store";
import { asUnknown } from "src/worker/snapshot/effector-snapshots";
import { hydratableValidationStore } from "src/worker/stores/validation-store";
import { runWorkerLoop } from "src/worker/worker-loop";
import { ensureWebRtcGlobals } from "./webrtc/webrtc-compat";
import { loadWorkerConfig } from "./worker/config";
import { createWorkerContext } from "./worker/context";

export async function runWorker() {
  ensureWebRtcGlobals();

  const workerConfig = await loadWorkerConfig();
  const ctx = createWorkerContext(workerConfig, [
    asUnknown(hydratableOperationsArtifactStore),
    asUnknown(hydratablePeerStore),
    asUnknown(hydratableValidationStore),
  ]);

  await runWorkerLoop(ctx);
}
