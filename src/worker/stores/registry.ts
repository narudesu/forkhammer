import { createPeerClient } from "src/peer-client";
import type { ProcessEventStores } from "src/worker/event-processor";
import { reconcileRequested } from "src/worker/events/store-events";
import type { ExecutionContext } from "../context";
import { createMessageCounterStore } from "./message-counter-store";
import { createPeerStore } from "./peer-store";
import { createValidationStore } from "./validation-store";
import "src/worker/jira-artifact/jira-artifact-store";

export function createWorkerStores(ctx: ExecutionContext): ProcessEventStores {
  return {
    workerStores: [
      createValidationStore(ctx),
      createMessageCounterStore(ctx),
      createPeerStore(ctx, createPeerClient()),
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
