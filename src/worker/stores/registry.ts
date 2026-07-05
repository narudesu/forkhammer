// import { createPeerClient } from "src/peer-protocol/peer-client";
import type { WorkerContext } from "src/worker/context/types";
import type { ProcessEventStores } from "src/worker/event-processor";
import { reconcileRequested } from "src/worker/events/store-events";
import "src/worker/jira-artifact/jira-artifact-store";
// import { createMessageCounterStore } from "./message-counter-store";
// import { createPeerStore } from "./peer-store";
// import { createValidationStore } from "./validation-store";

export function createWorkerStores(ctx: WorkerContext): ProcessEventStores {
  return {
    workerStores: [
      // createValidationStore(ctx),
      // createMessageCounterStore(ctx),
      // createPeerStore(ctx, createPeerClient()),
    ],
    extraReconcilables: [
      {
        name: "extra-reconcilable",
        reconcile: async () => {
          reconcileRequested({ ctx });
          return true;
        },
      },
    ],
  };
}
