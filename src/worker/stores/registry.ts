import type { ExecutionContext } from "../context";
import { createJiraArtifactStore } from "./jira-artifact-store";
import { createMessageCounterStore } from "./message-counter-store";
import { createPeerStore } from "./peer-store";
import type { WorkerStore } from "./types";
import { createValidationStore } from "./validation-store";

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
