import { hydratableArtifactStore } from "src/worker/jira-artifact/jira-artifact-store";
import { asUnknown } from "src/worker/stores/effector-snapshots";
import { hydratablePeerStore } from "src/worker/stores/peer-store";
import { runWorkerLoop } from "src/worker/worker-loop";
import { ensureWebRtcGlobals } from "./webrtc/webrtc-compat";
import { loadWorkerConfig } from "./worker/config";
import { createWorkerContext } from "./worker/context";

export async function runWorker() {
  ensureWebRtcGlobals();

  const workerConfig = await loadWorkerConfig();
  const ctx = createWorkerContext(workerConfig, [
    asUnknown(hydratableArtifactStore),
    asUnknown(hydratablePeerStore),
  ]);

  await runWorkerLoop(ctx);
}
