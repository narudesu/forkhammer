import { createEvent } from "effector";
import type { WorkerContext } from "src/worker/context/types";

export interface ReconcileRequestedEventData {
  ctx: WorkerContext;
}

export const reconcileRequested = createEvent<ReconcileRequestedEventData>();
