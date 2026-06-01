import type { ExecutionContext } from "../context";
import { createMessageCounterStore } from "./message-counter-store";
import { createJiraArtifactStore } from "./jira-artifact-store";
import { createValidationStore } from "./validation-store";
import { createPeerStore } from "./peer-store";
import type { WorkerStore } from "./types";

export function createWorkerStores(
  ctx: ExecutionContext,
): Array<WorkerStore<any>> {
  return [
    createValidationStore(ctx),
    createJiraArtifactStore(ctx),
    createMessageCounterStore(ctx),
    createPeerStore(ctx),
  ];
}
