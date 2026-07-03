import { createEvent } from "effector";
import { createPeerClient } from "src/peer-client";
import type { ProcessEventStores } from "src/worker/event-processor";
import type { ExecutionContext } from "../context";
import { createMessageCounterStore } from "./message-counter-store";
import { createPeerStore } from "./peer-store";
import { createValidationStore } from "./validation-store";
import {
  getJiraInboxArtifactStoreName,
  reconcileRequested,
} from "src/worker/jira-artifact/jira-artifact";

export function createWorkerStores(ctx: ExecutionContext): ProcessEventStores {
  return {
    workerStores: [
      createValidationStore(ctx),
      createMessageCounterStore(ctx),
      createPeerStore(ctx, createPeerClient()),
    ],
    extraReconcilables: [
      {
        name: getJiraInboxArtifactStoreName(),
        reconcile: async () => {
          reconcileRequested({ ctx });
          return true;
        },
      },
    ],
  };
}
