import { createEvent } from "effector";
import type { Scope } from "effector";
import type { WorkerContext } from "src/worker/context/types";

export interface ReconcileRequestedEventData {
  ctx: WorkerContext;
  scope?: Scope;
}

export const reconcileRequested = createEvent<ReconcileRequestedEventData>();
