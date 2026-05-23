import type { ExecutionContext } from "../context";
import { createMessageCounterStore } from "./message-counter-store";
import { createValidationStore } from "./validation-store";
import type { WorkerStore } from "./types";

export function createWorkerStores(
  ctx: ExecutionContext,
): Array<WorkerStore<any>> {
  return [createValidationStore(ctx), createMessageCounterStore(ctx)];
}
